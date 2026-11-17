const RETRY_DELAY_SECONDS = 300;
const RECOVERY_INTERVAL_MINUTES = 10;
const PREVIEW_ORIGIN = 'https://codex-commercial-website-mod.k4-technology.pages.dev';
const PRODUCTION_ORIGIN = 'https://k4-technology.com';

function isAllowedCallback(value) {
  let url;
  try { url = new URL(value); } catch { return false; }
  const validHost = url.hostname === 'k4-technology.com' ||
    url.hostname === 'www.k4-technology.com' ||
    url.hostname === 'k4-technology.pages.dev' ||
    url.hostname === 'codex-commercial-website-mod.k4-technology.pages.dev' ||
    /^[a-f0-9]{8}\.k4-technology\.pages\.dev$/.test(url.hostname);
  return url.protocol === 'https:' && validHost && url.pathname === '/api/notifications/dispatch';
}

function databaseFor(callbackUrl, env) {
  let hostname = '';
  try { hostname = new URL(callbackUrl).hostname; } catch {}
  return hostname === 'k4-technology.com' || hostname === 'www.k4-technology.com'
    ? env.PRODUCTION_LEADS_DB
    : env.PREVIEW_LEADS_DB;
}

function callbackFor(row, isPreview) {
  return row.callback_url || `${isPreview ? PREVIEW_ORIGIN : PRODUCTION_ORIGIN}/api/notifications/dispatch`;
}

async function recoverPending(db, isPreview, env) {
  if (!db || !env.LEAD_NOTIFICATIONS) return 0;
  const result = await db.prepare(`
    SELECT lead_id, dispatch_token, callback_url, status, last_enqueued_at
    FROM lead_notification_jobs
    WHERE status = 'pending'
      AND (last_enqueued_at IS NULL OR last_enqueued_at <= ?)
    ORDER BY updated_at
    LIMIT 50
  `).bind(new Date(Date.now() - RECOVERY_INTERVAL_MINUTES * 60_000).toISOString()).all();
  let enqueued = 0;
  for (const row of result.results || []) {
    const callbackUrl = callbackFor(row, isPreview);
    if (!isAllowedCallback(callbackUrl)) continue;
    try {
      await env.LEAD_NOTIFICATIONS.send({ callbackUrl, leadId: row.lead_id, dispatchToken: row.dispatch_token });
      const now = new Date().toISOString();
      await db.prepare(`UPDATE lead_notification_jobs
        SET callback_url = ?, last_enqueued_at = ?, last_error = NULL, updated_at = ?
        WHERE lead_id = ? AND status = 'pending'`)
        .bind(callbackUrl, now, now, row.lead_id).run();
      enqueued++;
    } catch {
      const now = new Date().toISOString();
      await db.prepare(`UPDATE lead_notification_jobs
        SET callback_url = ?, last_error = 'Scheduled queue recovery failed; will retry.', updated_at = ?
        WHERE lead_id = ? AND status = 'pending'`)
        .bind(callbackUrl, now, row.lead_id).run();
    }
  }
  return enqueued;
}

async function markDlqFailure(message, env) {
  const { callbackUrl, leadId, dispatchToken } = message.body || {};
  if (!isAllowedCallback(callbackUrl) || !/^[a-zA-Z0-9_-]{16,80}$/.test(String(leadId || '')) || String(dispatchToken || '').length < 32) {
    message.ack();
    return;
  }
  const db = databaseFor(callbackUrl, env);
  if (!db) { message.retry({ delaySeconds: RETRY_DELAY_SECONDS }); return; }
  const now = new Date().toISOString();
  const attempts = Math.max(1, Number(message.attempts || 12));
  const reason = `Email delivery exhausted Queue retries (${attempts}); moved to DLQ.`;
  const result = await db.prepare(`UPDATE lead_notification_jobs
    SET status = 'failed', attempts = MAX(attempts, ?), last_error = ?, failure_reason = ?, updated_at = ?
    WHERE lead_id = ? AND dispatch_token = ? AND status <> 'sent'`)
    .bind(attempts, reason, reason, now, leadId, dispatchToken).run();
  if (result.meta?.changes) {
    await db.prepare(`UPDATE site_leads
      SET email_status = CASE WHEN email_status = 'sent' THEN 'sent' ELSE 'failed' END,
          email_error = CASE WHEN email_status = 'sent' THEN email_error ELSE ? END,
          updated_at = ?
      WHERE id = ?`).bind(reason, now, leadId).run();
  }
  message.ack();
}

async function dispatchLead(message, env) {
  const { callbackUrl, leadId, dispatchToken } = message.body || {};
  if (!isAllowedCallback(callbackUrl) || !/^[a-zA-Z0-9_-]{16,80}$/.test(String(leadId || '')) || String(dispatchToken || '').length < 32) {
    message.ack();
    return;
  }
  const db = databaseFor(callbackUrl, env);
  if (!db || !env.EMAIL_DELIVERY_WORKER || !env.LEAD_DISPATCH_SECRET) {
    message.retry({ delaySeconds: RETRY_DELAY_SECONDS });
    return;
  }
  const job = await db.prepare('SELECT status FROM lead_notification_jobs WHERE lead_id = ? AND dispatch_token = ?').bind(leadId, dispatchToken).first();
  if (!job || job.status === 'failed' || job.status === 'sent') { message.ack(); return; }
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
  const claim = await db.prepare(`UPDATE lead_notification_jobs
    SET status = 'processing', attempts = attempts + 1, updated_at = ?
    WHERE lead_id = ? AND dispatch_token = ?
      AND (status = 'pending' OR (status = 'processing' AND updated_at < ?))`)
    .bind(now, leadId, dispatchToken, staleBefore).run();
  if (!claim.meta?.changes) { message.retry({ delaySeconds: RETRY_DELAY_SECONDS }); return; }
  const lead = await db.prepare('SELECT * FROM site_leads WHERE id = ?').bind(leadId).first();
  if (!lead) {
    await db.prepare("UPDATE lead_notification_jobs SET status = 'failed', last_error = 'Lead record is missing.', failure_reason = 'Lead record is missing.', updated_at = ? WHERE lead_id = ?").bind(now, leadId).run();
    message.ack();
    return;
  }
  if (lead.email_status === 'sent') {
    await db.prepare("UPDATE lead_notification_jobs SET status = 'sent', last_error = NULL, updated_at = ? WHERE lead_id = ?").bind(now, leadId).run();
    message.ack();
    return;
  }
  try {
    const response = await env.EMAIL_DELIVERY_WORKER.fetch(new Request('https://k4-internal/_internal/k4-lead-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-k4-dispatch-secret': env.LEAD_DISPATCH_SECRET },
      body: JSON.stringify({ lead })
    }));
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true) throw new Error('Email relay delivery failed.');
    const sentAt = new Date().toISOString();
    await db.prepare("UPDATE site_leads SET email_status = 'sent', email_attempts = email_attempts + 1, email_error = NULL, updated_at = ? WHERE id = ?").bind(sentAt, leadId).run();
    await db.prepare("UPDATE lead_notification_jobs SET status = 'sent', last_error = NULL, failure_reason = NULL, updated_at = ? WHERE lead_id = ?").bind(sentAt, leadId).run();
    message.ack();
  } catch {
    const retryAt = new Date(Date.now() + RETRY_DELAY_SECONDS * 1000).toISOString();
    const reason = 'Email relay delivery failed; Queue will retry.';
    await db.prepare("UPDATE site_leads SET email_status = 'pending', email_attempts = email_attempts + 1, email_error = ?, next_attempt_at = ?, updated_at = ? WHERE id = ?").bind(reason, retryAt, new Date().toISOString(), leadId).run();
    await db.prepare("UPDATE lead_notification_jobs SET status = 'pending', last_error = ?, updated_at = ? WHERE lead_id = ?").bind(reason, new Date().toISOString(), leadId).run();
    message.retry({ delaySeconds: RETRY_DELAY_SECONDS });
  }
}

export default {
  async queue(batch, env) {
    if (batch.queue === 'k4-site-lead-notifications-dlq') {
      for (const message of batch.messages) await markDlqFailure(message, env);
      return;
    }
    for (const message of batch.messages) await dispatchLead(message, env);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(Promise.all([
      recoverPending(env.PREVIEW_LEADS_DB, true, env),
      recoverPending(env.PRODUCTION_LEADS_DB, false, env),
    ]));
  },
};
