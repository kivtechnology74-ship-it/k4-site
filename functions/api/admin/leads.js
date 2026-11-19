const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const STATUSES = new Set(['NEW','ACKNOWLEDGED','CONTACTED','QUALIFIED','PROPOSAL','WON','LOST','SPAM','TEST']);
const TRANSITIONS = {
  NEW: ['ACKNOWLEDGED','SPAM'],
  ACKNOWLEDGED: ['CONTACTED','QUALIFIED','PROPOSAL','LOST','SPAM'],
  CONTACTED: ['QUALIFIED','PROPOSAL','LOST','SPAM'],
  QUALIFIED: ['PROPOSAL','WON','LOST','SPAM'],
  PROPOSAL: ['WON','LOST','SPAM'],
  WON: [], LOST: [], SPAM: [], TEST: [],
};
let cachedJwks;
let cachedJwksUntil = 0;

function reply(status, body) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function decodePart(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(normalized), c => c.charCodeAt(0))));
}

function decodeBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(normalized), c => c.charCodeAt(0));
}

async function accessIdentity(request, env) {
  const domain = String(env.CF_ACCESS_TEAM_DOMAIN || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const aud = String(env.LEAD_ADMIN_AUD || '').trim();
  const allow = new Set(String(env.LEAD_ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!domain || !aud || allow.size === 0 || !token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header, claims;
  try { header = decodePart(parts[0]); claims = decodePart(parts[1]); } catch { return null; }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== 'https://' + domain || !Array.isArray(claims.aud) || !claims.aud.includes(aud) ||
      !Number.isFinite(claims.exp) || claims.exp <= now || (claims.nbf && claims.nbf > now)) return null;

  try {
    if (!cachedJwks || cachedJwksUntil < Date.now()) {
      const response = await fetch('https://' + domain + '/cdn-cgi/access/certs', { headers: { accept: 'application/json' } });
      if (!response.ok) return null;
      cachedJwks = await response.json();
      cachedJwksUntil = Date.now() + 5 * 60_000;
    }
    const jwk = cachedJwks.keys?.find(key => key.kid === header.kid && key.kty === 'RSA');
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', key, decodeBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]),
    );
    const email = String(claims.email || '').toLowerCase();
    return valid && allow.has(email) ? email : null;
  } catch {
    return null;
  }
}

export async function onRequest({ request, env }) {
  if (!env.LEADS_DB) return reply(503, { error: 'Lead storage is unavailable.' });
  const actor = await accessIdentity(request, env);
  if (!actor) return reply(401, { error: 'Sign in through the authorized K4 Access policy.' });

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || '';
    if (status && !STATUSES.has(status)) return reply(400, { error: 'Invalid workflow status.' });
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 50)));
    const rows = await env.LEADS_DB.prepare(`
      SELECT id, created_at, language, form_type, contact, message, details_json, source_url,
             workflow_status, is_test, acknowledged_by, acknowledged_at, email_status,
             email_attempts, email_error, updated_at
      FROM site_leads
      WHERE (? = '' OR workflow_status = ?)
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(status, status, limit).all();
    return reply(200, { leads: rows.results || [] });
  }

  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed.' });
  let body;
  try { body = await request.json(); } catch { return reply(400, { error: 'Invalid request.' }); }
  const leadId = String(body?.leadId || '');
  const next = String(body?.status || '');
  const note = String(body?.note || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 500);
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(leadId) || !STATUSES.has(next) || next === 'NEW' || next === 'TEST') {
    return reply(400, { error: 'Invalid lead update.' });
  }

  const current = await env.LEADS_DB.prepare('SELECT workflow_status, is_test FROM site_leads WHERE id = ?').bind(leadId).first();
  if (!current) return reply(404, { error: 'Lead not found.' });
  if (current.is_test || current.workflow_status === 'TEST') return reply(409, { error: 'Test records cannot enter the commercial workflow.' });
  if (!TRANSITIONS[current.workflow_status]?.includes(next)) return reply(409, { error: 'This workflow transition is not allowed.' });

  const now = new Date().toISOString();
  const result = next === 'ACKNOWLEDGED'
    ? await env.LEADS_DB.prepare(`UPDATE site_leads SET workflow_status = ?, acknowledged_by = ?, acknowledged_at = ?, updated_at = ?
       WHERE id = ? AND workflow_status = ? AND is_test = 0`).bind(next, actor, now, now, leadId, current.workflow_status).run()
    : await env.LEADS_DB.prepare(`UPDATE site_leads SET workflow_status = ?, updated_at = ?
       WHERE id = ? AND workflow_status = ? AND is_test = 0`).bind(next, now, leadId, current.workflow_status).run();
  if (!result.meta?.changes) return reply(409, { error: 'The lead changed in another session. Reload and try again.' });

  await env.LEADS_DB.prepare(`INSERT INTO lead_workflow_events
    (lead_id, from_status, to_status, actor_email, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).bind(leadId, current.workflow_status, next, actor, note || null, now).run();
  return reply(200, { success: true, leadId, status: next, actor, updatedAt: now });
}
