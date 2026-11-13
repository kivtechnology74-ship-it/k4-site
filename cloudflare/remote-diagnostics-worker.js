const ALLOWED_ORIGINS = new Set([
  "https://k4-technology.com",
  "https://www.k4-technology.com",
  "https://k4-technology.pages.dev"
]);
const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "gclid", "fbclid"];
const MAX_ATTEMPTS = 8;

function corsHeaders(origin) {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
  if (origin && (ALLOWED_ORIGINS.has(origin) || /^https:\/\/[a-z0-9-]+\.k4-technology\.pages\.dev$/.test(origin))) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-methods"] = "POST, OPTIONS";
    headers["access-control-allow-headers"] = "content-type";
    headers.vary = "Origin";
  }
  return headers;
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(origin) });
}

function cleanText(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.has(origin) || /^https:\/\/[a-z0-9-]+\.k4-technology\.pages\.dev$/.test(origin);
}

function validContact(value) {
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const digits = value.replace(/\D/g, "").length;
  const phone = /^\+?[\d\s().-]+$/.test(value) && digits >= 7 && digits <= 15;
  return email || phone;
}

function safeSourceUrl(value) {
  try {
    const url = new URL(cleanText(value, 2000));
    if (!isAllowedOrigin(url.origin)) return "";
    const params = new URLSearchParams();
    for (const key of ATTRIBUTION_KEYS) {
      const item = cleanText(url.searchParams.get(key), 250);
      if (item) params.set(key, item);
    }
    return `${url.origin}${url.pathname}${params.size ? `?${params}` : ""}`.slice(0, 1500);
  } catch {
    return "";
  }
}

function cleanDetails(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 60).map((item) => ({
    name: cleanText(item?.name, 120),
    value: cleanText(item?.value, 3000)
  })).filter((item) => item.name && item.value);
}

function cleanAttribution(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(ATTRIBUTION_KEYS.map((key) => [key, cleanText(value[key], 250)]).filter(([, item]) => item));
}

function safeLanguage(value) {
  const language = cleanText(value, 10).toLowerCase();
  return ["en", "ru", "fr", "zh", "es", "pt-br"].includes(language) ? language : "en";
}

function reference(id) {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function renderText(row, limit = 12000) {
  const details = JSON.parse(row.details_json || "[]");
  const attribution = JSON.parse(row.attribution_json || "{}");
  return [
    "New K4 website inquiry",
    `Reference: ${reference(row.id)}`,
    `Received: ${row.created_at} (UTC)`,
    `Language: ${row.language}`,
    `Form: ${row.form_type}`,
    `Contact: ${row.contact}`,
    `Source: ${row.source_url}`,
    `Timezone: ${row.timezone || "not supplied"}`,
    "",
    "Message:", row.message,
    details.length ? `\nDetails:\n${details.map((item) => `${item.name}: ${item.value}`).join("\n")}` : "",
    Object.keys(attribution).length ? `\nAttribution:\n${Object.entries(attribution).map(([key, value]) => `${key}: ${value}`).join("\n")}` : "",
    `\nSafety acknowledgement: ${row.safety_ack ? "Yes" : "No"}`
  ].filter(Boolean).join("\n").slice(0, limit);
}

async function deliverEmail(row, env) {
  if (!env.GMAIL_RELAY_URL || !env.GMAIL_RELAY_SECRET) throw new Error("Email relay is not configured.");
  const lead = {
    id: row.id,
    created_at: row.created_at,
    language: row.language,
    form_type: row.form_type,
    contact: row.contact,
    message: row.message,
    details: JSON.parse(row.details_json || "[]"),
    source_url: row.source_url,
    timezone: row.timezone || "",
    attribution: JSON.parse(row.attribution_json || "{}"),
    safety_ack: row.safety_ack === true || row.safety_ack === 1
  };
  const timestamp = String(Date.now());
  const canonical = `${timestamp}.${JSON.stringify(lead)}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.GMAIL_RELAY_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signatureBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonical)));
  let binary = "";
  for (const byte of signatureBytes) binary += String.fromCharCode(byte);
  const signature = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const response = await fetch(env.GMAIL_RELAY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ timestamp, lead, signature })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) throw new Error("Email relay delivery failed.");
  return result;
}

async function attemptEmail(env, row) {
  if (row.email_status === "sent") return;
  const now = new Date().toISOString();
  const attempt = Number(row.email_attempts || 0) + 1;
  try {
    await deliverEmail(row, env);
    await env.LEADS_DB.prepare("UPDATE site_leads SET email_status = 'sent', email_attempts = ?, email_error = NULL, updated_at = ? WHERE id = ?").bind(attempt, now, row.id).run();
    row.email_status = "sent";
    row.email_attempts = attempt;
    row.email_error = null;
  } catch (error) {
    const status = attempt >= MAX_ATTEMPTS ? "failed" : "pending";
    const safeError = String(error).includes("domain config")
      ? "Cloudflare Email Sending domain is not configured."
      : "Email delivery failed.";
    await env.LEADS_DB.prepare("UPDATE site_leads SET email_status = ?, email_attempts = ?, email_error = ?, updated_at = ? WHERE id = ?").bind(status, attempt, safeError, now, row.id).run();
    row.email_status = status;
    row.email_attempts = attempt;
    row.email_error = safeError;
    console.error("Lead email delivery failed", { reference: reference(row.id), status, error: safeError });
  }
}

async function deliverPending(env, row) {
  await attemptEmail(env, row);
  return row;
}

async function handleSubmission(request, env) {
  const origin = request.headers.get("origin") || "";
  if (origin && !isAllowedOrigin(origin)) return json({ success: false, error: "Origin not allowed." }, 403, origin);
  if (!env.LEADS_DB || !env.SUBMIT_RATE_LIMIT) return json({ success: false, error: "Lead intake is temporarily unavailable." }, 503, origin);
  if (Number(request.headers.get("content-length") || 0) > 30000) return json({ success: false, error: "Request is too large." }, 413, origin);
  const rateLimit = await env.SUBMIT_RATE_LIMIT.limit({ key: request.headers.get("cf-connecting-ip") || "unknown" });
  if (!rateLimit.success) return json({ success: false, error: "Too many requests. Please try again later." }, 429, origin);
  let input;
  try { input = await request.json(); } catch { return json({ success: false, error: "Invalid request." }, 400, origin); }
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 30000) return json({ success: false, error: "Request is too large." }, 413, origin);
  if (cleanText(input.website, 200)) return json({ success: true, stored: false, spam: true }, 202, origin);

  const contact = cleanText(input.contact, 254);
  const message = cleanText(input.message || input.faultDescription, 4000);
  if (!validContact(contact)) return json({ success: false, error: "Enter a valid email address or phone number." }, 422, origin);
  const suppliedId = cleanText(input.requestId, 36);
  const id = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedId) ? suppliedId : crypto.randomUUID();
  const now = new Date().toISOString();
  const sourceUrl = safeSourceUrl(input.sourceUrl);
  if (!sourceUrl) return json({ success: false, error: "Invalid page source." }, 422, origin);
  const row = {
    id,
    created_at: now,
    language: safeLanguage(input.language),
    form_type: cleanText(input.formType, 80) || "website_form",
    contact,
    message,
    details_json: JSON.stringify(cleanDetails(input.details)),
    source_url: sourceUrl,
    timezone: cleanText(input.timezone, 100),
    attribution_json: JSON.stringify(cleanAttribution(input.attribution)),
    safety_ack: input.safetyAcknowledged === true ? 1 : 0,
    email_status: "pending",
    email_attempts: 0,
    next_attempt_at: now,
    updated_at: now
  };
  try {
    await env.LEADS_DB.prepare(`INSERT INTO site_leads
      (id, created_at, language, form_type, contact, message, details_json, source_url, timezone, attribution_json, safety_ack, email_status, email_attempts, next_attempt_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`)
      .bind(row.id, row.created_at, row.language, row.form_type, row.contact, row.message, row.details_json, row.source_url, row.timezone, row.attribution_json, row.safety_ack, now, now).run();
  } catch {
    const existing = await env.LEADS_DB.prepare("SELECT id, email_status FROM site_leads WHERE id = ?").bind(id).first();
    if (!existing) return json({ success: false, error: "The request could not be saved. Please retry or contact K4 directly." }, 503, origin);
    return json({ success: true, stored: true, reference: reference(id), emailStatus: existing.email_status }, 200, origin);
  }
  await deliverPending(env, row);
  return json({ success: true, stored: true, reference: reference(id), emailStatus: row.email_status }, 201, origin);
}

async function retryPending(env) {
  const result = await env.LEADS_DB.prepare(`SELECT * FROM site_leads
    WHERE email_status = 'pending'
      AND next_attempt_at <= ? ORDER BY created_at LIMIT 25`).bind(new Date().toISOString()).all();
  for (const row of result.results || []) {
    await deliverPending(env, row);
    const nextAttempt = new Date(Date.now() + Math.min(60, 2 ** Number(row.email_attempts || 0)) * 60_000).toISOString();
    await env.LEADS_DB.prepare("UPDATE site_leads SET next_attempt_at = ?, updated_at = ? WHERE id = ?").bind(nextAttempt, new Date().toISOString(), row.id).run();
  }
}

async function retryLegacyDiagnostics(env) {
  const result = await env.LEADS_DB.prepare(`SELECT * FROM diagnostic_requests
    WHERE email_status IN ('pending', 'failed') AND status = 'received'
      AND email_attempts < ? AND email_next_attempt_at <= ?
    ORDER BY created_at LIMIT 20`).bind(MAX_ATTEMPTS, new Date().toISOString()).all();
  for (const row of result.results || []) {
    const attempt = Number(row.email_attempts || 0) + 1;
    const now = new Date().toISOString();
    const nextAttempt = new Date(Date.now() + Math.min(60, 2 ** attempt) * 60_000).toISOString();
    try {
      const sent = await deliverEmail({
        id: row.id,
        created_at: row.created_at,
        language: row.language,
        form_type: "remote_diagnostics",
        contact: row.contact,
        message: row.fault_description,
        details_json: row.details_json || "[]",
        source_url: row.source_url || "",
        timezone: "",
        attribution_json: row.attribution_json || "{}",
        safety_ack: row.safety_ack
      }, env);
      await env.LEADS_DB.prepare("UPDATE diagnostic_requests SET email_status = 'sent', email_message_id = ?, email_error = NULL, email_attempts = ?, email_next_attempt_at = ?, updated_at = ? WHERE id = ?")
        .bind(sent?.messageId || null, attempt, nextAttempt, now, row.id).run();
    } catch (error) {
      const status = attempt >= MAX_ATTEMPTS ? "failed" : "pending";
      const message = String(error).includes("domain config")
        ? "Cloudflare Email Sending domain is not configured."
        : "Legacy diagnostic email delivery failed.";
      await env.LEADS_DB.prepare("UPDATE diagnostic_requests SET email_status = ?, email_error = ?, email_attempts = ?, email_next_attempt_at = ?, updated_at = ? WHERE id = ?")
        .bind(status, message, attempt, nextAttempt, now, row.id).run();
      console.error("Legacy diagnostic email delivery failed", { reference: reference(row.id), status, error: message });
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method === "GET" && url.pathname.endsWith("/health")) {
      return json({ ok: true, storage: Boolean(env.LEADS_DB), emailConfigured: Boolean(env.GMAIL_RELAY_URL && env.GMAIL_RELAY_SECRET) }, 200, origin);
    }
    if (request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405, origin);
    return handleSubmission(request, env);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(Promise.all([retryPending(env), retryLegacyDiagnostics(env)]));
  }
};
