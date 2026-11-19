export async function sendEmailThroughRelay(row, env) {
  const lead = {
    id: row.id,
    reference: row.id,
    notification_type: row.notification_type || 'new_lead',
    delivery_id: row.delivery_id || row.id,
    workflow_status: row.workflow_status || 'NEW',
    is_test: row.is_test === true || row.is_test === 1,
    created_at: row.created_at,
    language: row.language,
    form_type: row.form_type,
    contact: row.contact,
    message: row.message,
    details: JSON.parse(row.details_json || '[]'),
    source_url: row.source_url,
    timezone: row.timezone || '',
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
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': `k4-lead-${lead.delivery_id}` },
    body: JSON.stringify({ timestamp, lead, signature }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) throw new Error('Email relay delivery failed.');
}

// Retained as an optional future channel; email delivery does not call or depend on it.
export async function sendTelegram(row, env) {
  const details = JSON.parse(row.details_json || '[]').map(item => `${item.name}: ${item.value}`).join('\n');
  const text = [
    `K4 website lead (${row.language}, ${row.form_type})`,
    `Reference: ${row.id}`,
    `Contact: ${row.contact}`,
    `Page: ${row.source_url}`,
    row.message,
    details,
  ].filter(Boolean).join('\n').slice(0, 3800);
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) throw new Error('Telegram delivery failed.');
}
