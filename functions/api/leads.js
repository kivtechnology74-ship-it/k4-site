const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const ALLOWED_LANGUAGES = new Set(['en', 'ru', 'fr', 'es', 'pt-br', 'zh']);
const ALLOWED_TYPES = new Set([
  'power_project_inquiry',
  'remote_diagnostics',
  'remote_technical_review',
]);
const MAX_BODY_BYTES = 24_000;
const MAX_FIELDS = 80;
const MAX_VALUE_LENGTH = 4_000;
const ATTRIBUTION_KEYS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'gclid', 'fbclid',
]);

function response(status, body) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function cleanText(value, max = MAX_VALUE_LENGTH) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
}

function validContact(fields) {
  const candidates = Object.entries(fields)
    .filter(([key]) => /email|e-mail|courriel|почт|телефон|phone|whatsapp|contact/i.test(key))
    .map(([, value]) => String(value));
  return candidates.some(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) ||
    candidates.some(value => value.replace(/[\s()+.-]/g, '').length >= 7 && /^[+\d\s().-]+$/.test(value));
}

async function hashIp(ip, day) {
  const bytes = new TextEncoder().encode(`${day}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function safeAttribution(input) {
  const output = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return output;
  for (const [key, value] of Object.entries(input)) {
    if (ATTRIBUTION_KEYS.has(key) && typeof value === 'string') output[key] = cleanText(value, 200);
  }
  return output;
}

async function sendEmailThroughRelay(row, env) {
  const lead = {
    id: row.id, created_at: row.created_at, language: row.language, form_type: row.form_type,
    contact: row.contact, message: row.message, details: JSON.parse(row.details_json || '[]'),
    source_url: row.source_url, timezone: row.timezone || '',
    attribution: JSON.parse(row.attribution_json || '{}'),
    safety_ack: row.safety_ack === true || row.safety_ack === 1,
  };
  const timestamp = String(Date.now());
  const canonical = `${timestamp}.${JSON.stringify(lead)}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.GMAIL_RELAY_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signatureBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical)));
  let binary = '';
  for (const byte of signatureBytes) binary += String.fromCharCode(byte);
  const signature = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const response = await fetch(env.GMAIL_RELAY_URL, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ timestamp, lead, signature }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) throw new Error('Email relay delivery failed.');
}

function telegramMessage(row) {
  const details = JSON.parse(row.details_json || '[]').map(item => `${item.name}: ${item.value}`).join('\n');
  return [
    `K4 website lead (${row.language}, ${row.form_type})`, `Reference: ${row.id}`,
    `Contact: ${row.contact}`, `Page: ${row.source_url}`, row.message, details,
  ].filter(Boolean).join('\n').slice(0, 3800);
}

async function sendTelegram(row, env) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: telegramMessage(row), disable_web_page_preview: true }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) throw new Error('Telegram delivery failed.');
}

async function retryDelivery(deliver, recordAttempt, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await deliver();
      await recordAttempt(attempt, true);
      return 'sent';
    } catch {
      await recordAttempt(attempt, false);
      if (attempt < maxAttempts) await new Promise(resolve => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }
  return 'pending';
}

async function dispatchNotifications(env, row) {
  const status = { email: row.email_status || 'pending', telegram: row.telegram_status || 'pending' };
  if (env.LEAD_EMAIL_MODE === 'direct' && status.email !== 'sent' && env.GMAIL_RELAY_URL && env.GMAIL_RELAY_SECRET) {
    const previousAttempts = Number(row.email_attempts || 0);
    status.email = await retryDelivery(() => sendEmailThroughRelay(row, env), async (attempt, sent) => {
      await env.LEADS_DB.prepare('UPDATE site_leads SET email_status = ?, email_attempts = ?, email_error = ?, updated_at = ? WHERE id = ?')
        .bind(sent ? 'sent' : 'pending', previousAttempts + attempt, sent ? null : 'Email delivery failed.', new Date().toISOString(), row.id).run();
    });
  }
  if (status.telegram !== 'sent' && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    const previousAttempts = Number(row.telegram_attempts || 0);
    status.telegram = await retryDelivery(() => sendTelegram(row, env), async (attempt, sent) => {
      await env.LEADS_DB.prepare('UPDATE site_leads SET telegram_status = ?, telegram_attempts = ?, telegram_error = ?, updated_at = ? WHERE id = ?')
        .bind(sent ? 'sent' : 'pending', previousAttempts + attempt, sent ? null : 'Telegram delivery failed.', new Date().toISOString(), row.id).run();
    });
  }
  return status;
}

export async function onRequestPost({ request, env }) {
  if (!env.LEADS_DB) return response(503, { error: 'Lead storage is unavailable.' });
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return response(413, { error: 'Request is too large.' });

  let payload;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return response(413, { error: 'Request is too large.' });
    payload = JSON.parse(raw);
  } catch {
    return response(400, { error: 'Invalid request.' });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return response(400, { error: 'Invalid request.' });
  if (cleanText(payload.website, 200)) return response(200, { success: true, stored: false });

  const formType = cleanText(payload.formType, 80);
  const language = cleanText(payload.language, 10).toLowerCase();
  const id = cleanText(payload.requestId, 80);
  if (!ALLOWED_TYPES.has(formType) || !ALLOWED_LANGUAGES.has(language) || !/^[a-zA-Z0-9_-]{16,80}$/.test(id)) {
    return response(400, { error: 'Please check the form and try again.' });
  }

  const fieldsInput = payload.fields;
  if (!fieldsInput || typeof fieldsInput !== 'object' || Array.isArray(fieldsInput) || Object.keys(fieldsInput).length > MAX_FIELDS) {
    return response(400, { error: 'Please check the form and try again.' });
  }
  const fields = {};
  for (const [key, raw] of Object.entries(fieldsInput)) {
    const label = cleanText(key, 120);
    if (!label || label.toLowerCase() === 'website') continue;
    const values = Array.isArray(raw) ? raw : [raw];
    fields[label] = values.map(value => cleanText(value)).filter(Boolean).join(', ');
  }
  const isContactField = key => /email|e-mail|courriel|почт|телефон|phone|whatsapp|contact/i.test(key);
  if (!validContact(fields)) return response(422, { error: 'Enter a valid business email or phone number.' });

  const sourceUrl = cleanText(payload.sourceUrl, 1_000);
  let parsedUrl;
  try { parsedUrl = new URL(sourceUrl); } catch { return response(400, { error: 'Invalid source page.' }); }
  const origin = new URL(request.url).origin;
  if (parsedUrl.origin !== origin || (request.headers.get('origin') && request.headers.get('origin') !== origin)) {
    return response(400, { error: 'Invalid source page.' });
  }

  const now = new Date();
  const createdAt = now.toISOString();
  const day = createdAt.slice(0, 10);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const ipHash = await hashIp(ip, day);
  const rateId = `${day}:${ipHash}`;
  await env.LEADS_DB.prepare(`
    INSERT INTO lead_rate_limits (id, request_count, updated_at) VALUES (?, 1, ?)
    ON CONFLICT(id) DO UPDATE SET request_count = request_count + 1, updated_at = excluded.updated_at
  `).bind(rateId, createdAt).run();
  const rate = await env.LEADS_DB.prepare('SELECT request_count FROM lead_rate_limits WHERE id = ?').bind(rateId).first();
  if (rate?.request_count > 8) return response(429, { error: 'Too many requests. Please try again later.' });
  await env.LEADS_DB.prepare("DELETE FROM lead_rate_limits WHERE updated_at < datetime('now', '-3 days')").run();

  const contact = Object.entries(fields).filter(([key]) => isContactField(key)).map(([, value]) => value).join(' · ');
  const details = Object.entries(fields).filter(([key]) => !isContactField(key)).map(([name, value]) => ({ name, value }));
  const attribution = safeAttribution(payload.attribution);
  const sourceParams = new URLSearchParams();
  for (const key of ATTRIBUTION_KEYS) {
    const value = parsedUrl.searchParams.get(key);
    if (value) sourceParams.set(key, cleanText(value, 200));
  }
  const safeSourceUrl = `${parsedUrl.pathname}${sourceParams.size ? `?${sourceParams}` : ''}`;
  const timezone = cleanText(payload.timezone, 80);
  const message = details.map(({ name, value }) => `${name}: ${value}`).join('\n').slice(0, 12_000);
  try {
    await env.LEADS_DB.prepare(`
      INSERT INTO site_leads
        (id, created_at, language, form_type, contact, message, details_json, source_url,
         timezone, attribution_json, safety_ack, email_status, email_attempts, email_error,
         next_attempt_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, NULL, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).bind(
      id, createdAt, language, formType, contact, message, JSON.stringify(details),
      safeSourceUrl, timezone, JSON.stringify(attribution),
      (payload.safetyAck || Object.keys(fields).some(key => /safety|sécurité|безопасност/i.test(key))) ? 1 : 0, createdAt, createdAt,
    ).run();
  } catch {
    return response(503, { error: 'We could not save the request. Please try again.' });
  }

  const stored = await env.LEADS_DB.prepare('SELECT * FROM site_leads WHERE id = ?').bind(id).first();
  if (!stored) return response(503, { error: 'We could not save the request. Please try again.' });
  const dispatchToken = crypto.randomUUID();
  await env.LEADS_DB.prepare(`
    INSERT INTO lead_notification_jobs (lead_id, dispatch_token, status, attempts, created_at, updated_at)
    VALUES (?, ?, 'pending', 0, ?, ?)
    ON CONFLICT(lead_id) DO NOTHING
  `).bind(id, dispatchToken, createdAt, createdAt).run();
  const notifications = await dispatchNotifications(env, stored);
  const jobStatus = notifications.email === 'sent' && notifications.telegram === 'sent' ? 'sent' : 'pending';
  await env.LEADS_DB.prepare('UPDATE lead_notification_jobs SET status = ?, attempts = ?, last_error = ?, updated_at = ? WHERE lead_id = ?')
    .bind(jobStatus, Number(stored.email_attempts || 0) + Number(stored.telegram_attempts || 0), jobStatus === 'sent' ? null : 'One or more notifications are pending.', new Date().toISOString(), id).run();
  return response(200, { success: true, stored: true, reference: id, notifications });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { ...JSON_HEADERS, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' } });
}
