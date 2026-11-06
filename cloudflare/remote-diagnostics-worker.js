const ALLOWED_ORIGINS = new Set([
  "https://k4-technology.com",
  "https://www.k4-technology.com"
]);

function corsHeaders(origin) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  };
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

function validContact(value) {
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const digits = value.replace(/\D/g, "").length;
  const phone = /^\+?[\d\s().-]+$/.test(value) && digits >= 7 && digits <= 15;
  return email || phone;
}

function cleanDetails(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((item) => ({
    name: cleanText(item?.name, 120),
    value: cleanText(item?.value, 4000)
  })).filter((item) => item.name && item.value);
}

function cleanAttribution(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "gclid", "fbclid"];
  return Object.fromEntries(allowed.map((key) => [key, cleanText(value[key], 250)]).filter(([, item]) => item));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function recordFromRow(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    contact: row.contact,
    faultDescription: row.fault_description,
    language: row.language,
    sourceUrl: row.source_url,
    cfCountry: row.cf_country,
    safetyAcknowledged: Boolean(row.safety_ack),
    details: JSON.parse(row.details_json || "[]"),
    attribution: JSON.parse(row.attribution_json || "{}")
  };
}

async function sendNotification(record, env) {
  const reference = record.id.slice(0, 8).toUpperCase();
  const detailsText = record.details.map((item) => `${item.name}: ${item.value}`).join("\n");
  const attributionText = Object.entries(record.attribution).map(([key, value]) => `${key}: ${value}`).join("\n");
  const textBody = [
    "New K4 Remote Diagnostics request",
    `Reference: ${reference}`,
    `Received: ${record.createdAt}`,
    `Contact: ${record.contact}`,
    `Language: ${record.language}`,
    `Country (Cloudflare): ${record.cfCountry || "not available"}`,
    `Source: ${record.sourceUrl || "not available"}`,
    "",
    "Fault description:",
    record.faultDescription,
    "",
    detailsText ? `Additional details:\n${detailsText}` : "",
    attributionText ? `\nAttribution:\n${attributionText}` : "",
    `\nSafety acknowledgement: ${record.safetyAcknowledged ? "Yes" : "No"}`
  ].filter(Boolean).join("\n");

  const detailRows = record.details.map((item) => `<tr><th style="text-align:left;padding:6px 10px 6px 0;vertical-align:top">${escapeHtml(item.name)}</th><td style="padding:6px 0">${escapeHtml(item.value)}</td></tr>`).join("");
  const htmlBody = `<h2>New K4 Remote Diagnostics request</h2>
<p><strong>Reference:</strong> ${reference}<br><strong>Received:</strong> ${escapeHtml(record.createdAt)}<br><strong>Contact:</strong> ${escapeHtml(record.contact)}<br><strong>Language:</strong> ${escapeHtml(record.language)}</p>
<h3>Fault description</h3><p style="white-space:pre-wrap">${escapeHtml(record.faultDescription)}</p>
${detailRows ? `<h3>Additional details</h3><table>${detailRows}</table>` : ""}
<p><strong>Source:</strong> ${escapeHtml(record.sourceUrl || "not available")}<br><strong>Safety acknowledgement:</strong> ${record.safetyAcknowledged ? "Yes" : "No"}</p>`;

  const message = {
    from: { email: env.FROM_EMAIL, name: "K4 Remote Diagnostics" },
    to: { email: env.RECIPIENT_EMAIL, name: "K4 Diagnostics" },
    subject: `[K4 Diagnostics] ${reference} — new request`,
    text: textBody,
    html: htmlBody
  };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.contact)) {
    message.replyTo = record.contact;
  }
  return env.LEAD_EMAIL.send(message);
}

async function updateEmailStatus(env, id, status, messageId, error) {
  const now = new Date().toISOString();
  await env.LEADS_DB.prepare(
    "UPDATE diagnostic_requests SET email_status = ?, email_message_id = ?, email_error = ?, updated_at = ? WHERE id = ?"
  ).bind(status, messageId || null, error ? cleanText(error, 1000) : null, now, id).run();
}

async function handleSubmission(request, env) {
  const origin = request.headers.get("origin") || "";
  if (origin && !ALLOWED_ORIGINS.has(origin) && !/^https:\/\/[a-z0-9-]+\.k4-technology\.pages\.dev$/.test(origin)) {
    return json({ success: false, error: "Origin not allowed." }, 403, origin);
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 30000) return json({ success: false, error: "Request is too large." }, 413, origin);
  const rateLimit = await env.SUBMIT_RATE_LIMIT.limit({ key: request.headers.get("cf-connecting-ip") || "unknown" });
  if (!rateLimit.success) return json({ success: false, error: "Too many requests. Please try again later." }, 429, origin);

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ success: false, error: "Invalid request." }, 400, origin);
  }

  if (cleanText(input.website, 200)) {
    return json({ success: true, stored: true, reference: "RECEIVED" }, 200, origin);
  }

  const contact = cleanText(input.contact, 254);
  const faultDescription = cleanText(input.faultDescription, 2000);
  if (!validContact(contact) || faultDescription.length < 5) {
    return json({ success: false, error: "A valid contact and fault description are required." }, 422, origin);
  }

  const suppliedId = cleanText(input.requestId, 36);
  const id = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedId) ? suppliedId : crypto.randomUUID();
  const now = new Date().toISOString();
  const language = ["en", "ru", "fr"].includes(input.language) ? input.language : "en";
  const sourceUrl = cleanText(input.sourceUrl, 500);
  const details = cleanDetails(input.details);
  const attribution = cleanAttribution(input.attribution);
  const cfCountry = cleanText(request.cf?.country, 2);
  const safetyAcknowledged = input.safetyAcknowledged === true ? 1 : 0;

  try {
    await env.LEADS_DB.prepare(
      `INSERT INTO diagnostic_requests
      (id, created_at, contact, fault_description, engine_model, alarm_code, site_country, language, source_url, cf_country, status, email_status, updated_at, details_json, attribution_json, safety_ack)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', 'pending', ?, ?, ?, ?)`
    ).bind(
      id, now, contact, faultDescription, cleanText(input.engineModel, 250), cleanText(input.alarmCode, 1000),
      cleanText(input.siteCountry, 150), language, sourceUrl, cfCountry, now,
      JSON.stringify(details), JSON.stringify(attribution), safetyAcknowledged
    ).run();
  } catch (error) {
    const existing = await env.LEADS_DB.prepare(
      "SELECT id, email_status FROM diagnostic_requests WHERE id = ?"
    ).bind(id).first();
    if (existing) {
      return json({ success: true, stored: true, reference: id.slice(0, 8).toUpperCase(), emailStatus: existing.email_status }, 200, origin);
    }
    return json({ success: false, error: "The request could not be saved. Please try again or use WhatsApp." }, 500, origin);
  }

  const record = {
    id,
    createdAt: now,
    contact,
    faultDescription,
    language,
    sourceUrl,
    cfCountry,
    safetyAcknowledged: Boolean(safetyAcknowledged),
    details,
    attribution
  };
  try {
    const result = await sendNotification(record, env);
    await updateEmailStatus(env, id, "sent", result?.messageId, null);
    return json({ success: true, stored: true, reference: id.slice(0, 8).toUpperCase(), emailStatus: "sent" }, 201, origin);
  } catch (error) {
    await updateEmailStatus(env, id, "pending", null, String(error));
    return json({ success: true, stored: true, reference: id.slice(0, 8).toUpperCase(), emailStatus: "pending" }, 202, origin);
  }
}

async function retryPending(env) {
  const pending = await env.LEADS_DB.prepare(
    "SELECT * FROM diagnostic_requests WHERE email_status IN ('pending','failed') AND status = 'received' ORDER BY created_at LIMIT 20"
  ).all();
  for (const row of pending.results || []) {
    try {
      const result = await sendNotification(recordFromRow(row), env);
      await updateEmailStatus(env, row.id, "sent", result?.messageId, null);
    } catch (error) {
      await updateEmailStatus(env, row.id, "failed", null, String(error));
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, storage: "D1", notification: "email" }, 200, origin);
    }
    if (request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405, origin);
    return handleSubmission(request, env);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(retryPending(env));
  }
};
