const ALLOWED_ORIGINS = new Set([
  "https://k4-technology.com",
  "https://www.k4-technology.com",
  "https://k4-technology.pages.dev"
]);
const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "gclid", "fbclid"];
const MAX_ATTEMPTS = 8;
const CALCULATOR_EVENTS = new Set(["calculator_page_view", "calculator_started", "calculator_model_selected", "calculator_result_completed", "calculator_pdf_clicked", "calculator_contact_clicked"]);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const language = cleanText(value, 20).toLowerCase().replace(/_/g, "-");
  if (language.startsWith("zh")) return "zh";
  if (language.startsWith("pt")) return "pt-br";
  const baseLanguage = language.split("-")[0];
  return ["en", "ru", "fr", "es"].includes(baseLanguage) ? baseLanguage : "en";
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

function calculatorTrafficClass(request, profileType, requestedClass) {
  const origin = request.headers.get("origin") || "";
  if (/\.k4-technology\.pages\.dev$/.test(new URL(origin || "https://invalid.local").hostname) || requestedClass === "qa") return "qa";
  const agent = request.headers.get("user-agent") || "";
  if (/bot|crawler|spider|headless|lighthouse|pagespeed/i.test(agent)) return "probable_automation";
  if (profileType === "demo") return "demo";
  return "production";
}

function isInternalTraffic(request) {
  return (request.headers.get("cookie") || "").split(";").some(part => part.trim() === "k4_internal=1");
}

function safeCalculatorEvent(input, request) {
  if (!CALCULATOR_EVENTS.has(input?.event_name)) return null;
  if (!UUID_V4.test(cleanText(input.event_id, 36)) || !UUID_V4.test(cleanText(input.session_id, 36)) || !UUID_V4.test(cleanText(input.calc_id, 36))) return null;
  const pagePath = cleanText(input.page_path, 100);
  if (!["/gpu-estimate/", "/gpu-estimate/en-beta/"].includes(pagePath)) return null;
  const language = cleanText(input.language, 5);
  const profileType = cleanText(input.profile_type, 12);
  if (!["ru", "en"].includes(language) || !["oem", "incomplete", "manual", "demo"].includes(profileType)) return null;
  if (input.event_name === "calculator_result_completed" && profileType === "demo") return null;
  return {
    event_id: input.event_id, created_at: new Date().toISOString(), event_name: input.event_name,
    session_id: input.session_id, calc_id: input.calc_id,
    brand: cleanText(input.brand, 60) || "unknown", model_id: cleanText(input.model_id, 80) || "unknown",
    model_name: cleanText(input.model_name, 100) || "unknown", profile_type: profileType, language,
    calculator_version: cleanText(input.calculator_version, 20) || "unknown", page_path: pagePath,
    traffic_class: calculatorTrafficClass(request, profileType, input.traffic_class),
    internal_traffic: isInternalTraffic(request) ? 1 : 0
  };
}

async function handleCalculatorEvent(request, env) {
  const origin = request.headers.get("origin") || "";
  if (origin && !isAllowedOrigin(origin)) return json({ success: false }, 403, origin);
  if (!env.LEADS_DB || !env.CALCULATOR_EVENT_RATE_LIMIT) return json({ success: false }, 503, origin);
  if (Number(request.headers.get("content-length") || 0) > 4000) return json({ success: false }, 413, origin);
  const limited = await env.CALCULATOR_EVENT_RATE_LIMIT.limit({ key: request.headers.get("cf-connecting-ip") || "unknown" });
  if (!limited.success) return json({ success: false }, 429, origin);
  let input;
  try { input = await request.json(); } catch { return json({ success: false }, 400, origin); }
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 4000) return json({ success: false }, 413, origin);
  const event = safeCalculatorEvent(input, request);
  if (!event) return json({ success: false }, 422, origin);
  try {
    const statements = [];
    if (event.event_name === "calculator_result_completed" && event.traffic_class !== "demo") {
      statements.push(env.LEADS_DB.prepare(`INSERT OR IGNORE INTO calculator_completions
        (calc_id, created_at, brand, model_id, model_name, profile_type, language, calculator_version, page_path, traffic_class, internal_traffic)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(event.calc_id, event.created_at, event.brand, event.model_id, event.model_name, event.profile_type, event.language, event.calculator_version, event.page_path, event.traffic_class, event.internal_traffic));
    }
    statements.push(env.LEADS_DB.prepare(`INSERT OR IGNORE INTO calculator_events
      (event_id, created_at, event_name, session_id, calc_id, brand, model_id, model_name, profile_type, language, calculator_version, page_path, traffic_class, internal_traffic)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(event.event_id, event.created_at, event.event_name, event.session_id, event.calc_id, event.brand, event.model_id, event.model_name, event.profile_type, event.language, event.calculator_version, event.page_path, event.traffic_class, event.internal_traffic));
    const results = await env.LEADS_DB.batch(statements);
    return json({ success: true, stored: true, duplicate: results.every(result => Number(result.meta?.changes || 0) === 0) }, 202, origin);
  } catch {
    return json({ success: false, stored: false }, 503, origin);
  }
}

async function recordCalculatorLead(env, leadId, calcId, allowQa = false) {
  if (!calcId || !UUID_V4.test(calcId)) return false;
  try {
    const completion = await env.LEADS_DB.prepare(`SELECT calc_id, brand, model_id, model_name, profile_type, language, calculator_version, page_path
      FROM calculator_completions WHERE calc_id = ? AND internal_traffic = 0 AND (traffic_class = 'production' OR (? = 1 AND traffic_class = 'qa'))`).bind(calcId, allowQa ? 1 : 0).first();
    if (!completion) return false;
    await env.LEADS_DB.prepare(`INSERT OR IGNORE INTO calculator_events
      (event_id, created_at, event_name, session_id, calc_id, brand, model_id, model_name, profile_type, language, calculator_version, page_path, traffic_class, internal_traffic)
      VALUES (?, ?, 'generate_lead', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`)
      .bind(`lead-${leadId}`, new Date().toISOString(), leadId, calcId, completion.brand, completion.model_id, completion.model_name, completion.profile_type, completion.language, completion.calculator_version, completion.page_path, completion.traffic_class).run();
    return true;
  } catch { return false; }
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
  const suppliedCalcId = cleanText(input.calcId, 36);
  const calcId = UUID_V4.test(suppliedCalcId) ? suppliedCalcId : null;
  let validCalcId = null;
  if (calcId) {
    try {
      const completion = await env.LEADS_DB.prepare("SELECT calc_id FROM calculator_completions WHERE calc_id = ? AND internal_traffic = 0 AND (traffic_class = 'production' OR (? = 1 AND traffic_class = 'qa'))").bind(calcId, env.K4_PREVIEW_QA === true ? 1 : 0).first();
      if (completion) validCalcId = calcId;
    } catch { /* Missing analytics tables must not block lead storage. */ }
  }
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
    calc_id: validCalcId,
    safety_ack: input.safetyAcknowledged === true ? 1 : 0,
    email_status: env.K4_PREVIEW_QA === true ? "suppressed" : "pending",
    email_attempts: 0,
    next_attempt_at: now,
    updated_at: now
  };
  try {
    await env.LEADS_DB.prepare(`INSERT INTO site_leads
      (id, created_at, language, form_type, contact, message, details_json, source_url, timezone, attribution_json, safety_ack, calc_id, email_status, email_attempts, next_attempt_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
      .bind(row.id, row.created_at, row.language, row.form_type, row.contact, row.message, row.details_json, row.source_url, row.timezone, row.attribution_json, row.safety_ack, row.calc_id, row.email_status, now, now).run();
  } catch {
    const existing = await env.LEADS_DB.prepare("SELECT id, email_status, calc_id FROM site_leads WHERE id = ?").bind(id).first();
    if (!existing) return json({ success: false, error: "The request could not be saved. Please retry or contact K4 directly." }, 503, origin);
    const calculatorAttributionStored = await recordCalculatorLead(env, id, existing.calc_id, env.K4_PREVIEW_QA === true);
    return json({ success: true, stored: true, reference: reference(id), emailStatus: existing.email_status, calculatorAttributionStored }, 200, origin);
  }
  const calculatorAttributionStored = await recordCalculatorLead(env, id, row.calc_id, env.K4_PREVIEW_QA === true);
  if (env.K4_PREVIEW_QA !== true) await deliverPending(env, row);
  return json({ success: true, stored: true, reference: reference(id), emailStatus: row.email_status, calculatorAttributionStored }, 201, origin);
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
    const referer = request.headers.get("referer") || "";
    const previewSource = [origin, referer].some(value => {
      if (!value) return false;
      try { return new URL(value).hostname.endsWith(".k4-technology.pages.dev"); }
      catch { return false; }
    });
    const previewRequestHost = url.hostname.endsWith(".k4-technology.pages.dev");
    if (previewSource && !previewRequestHost) return json({ success: false, error: "Preview requests cannot use production intake." }, 403, origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method === "GET" && url.pathname.endsWith("/health")) {
      return json({ ok: true, storage: Boolean(env.LEADS_DB), emailConfigured: Boolean(env.GMAIL_RELAY_URL && env.GMAIL_RELAY_SECRET) }, 200, origin);
    }
    if (request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405, origin);
    if (url.pathname.endsWith("/api/calculator-events")) return handleCalculatorEvent(request, env);
    return handleSubmission(request, env);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(Promise.all([retryPending(env), retryLegacyDiagnostics(env)]));
  }
};
