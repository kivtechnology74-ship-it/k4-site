import { sendEmailThroughRelay, sendTelegram } from '../../_shared/notifications.js';

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

export async function onRequestPost({ request, env }) {
  if (!env.LEADS_DB) return json(503, { error: 'Notification storage is unavailable.' });
  let payload;
  try { payload = await request.json(); } catch { return json(400, { error: 'Invalid request.' }); }
  const leadId = String(payload?.leadId || '');
  const token = String(payload?.dispatchToken || '');
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(leadId) || token.length < 32 || token.length > 80) return json(400, { error: 'Invalid request.' });

  const job = await env.LEADS_DB.prepare('SELECT status, attempts FROM lead_notification_jobs WHERE lead_id = ? AND dispatch_token = ?').bind(leadId, token).first();
  if (!job) return json(404, { error: 'Notification job not found.' });
  if (job.status === 'sent') return json(200, { success: true, duplicate: true });
  const now = new Date();
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const claim = await env.LEADS_DB.prepare(`
    UPDATE lead_notification_jobs SET status = 'processing', updated_at = ?
    WHERE lead_id = ? AND dispatch_token = ?
      AND (status = 'pending' OR (status = 'processing' AND updated_at < ?))
  `).bind(nowIso, leadId, token, staleBefore).run();
  if (!claim.meta?.changes) {
    const current = await env.LEADS_DB.prepare('SELECT status FROM lead_notification_jobs WHERE lead_id = ?').bind(leadId).first();
    return current?.status === 'sent'
      ? json(200, { success: true, duplicate: true })
      : json(503, { error: 'Notification is already being processed.' });
  }
  const lead = await env.LEADS_DB.prepare('SELECT * FROM site_leads WHERE id = ?').bind(leadId).first();
  if (!lead) return json(404, { error: 'Lead not found.' });

  const attempts = Number(job.attempts || 0) + 1;
  try {
    if (env.LEAD_EMAIL_MODE === 'direct' && lead.email_status !== 'sent') {
      if (!env.GMAIL_RELAY_URL || !env.GMAIL_RELAY_SECRET) throw new Error('Email relay is not configured.');
      await sendEmailThroughRelay(lead, env);
      await env.LEADS_DB.prepare("UPDATE site_leads SET email_status = 'sent', email_attempts = email_attempts + 1, email_error = NULL, updated_at = ? WHERE id = ?").bind(nowIso, leadId).run();
    }
    if (lead.telegram_status !== 'sent') {
      if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) throw new Error('Telegram is not configured.');
      await sendTelegram(lead, env);
      await env.LEADS_DB.prepare("UPDATE site_leads SET telegram_status = 'sent', telegram_attempts = telegram_attempts + 1, telegram_error = NULL, updated_at = ? WHERE id = ?").bind(nowIso, leadId).run();
    }
    await env.LEADS_DB.prepare("UPDATE lead_notification_jobs SET status = 'sent', attempts = ?, last_error = NULL, updated_at = ? WHERE lead_id = ?").bind(attempts, nowIso, leadId).run();
    return json(200, { success: true });
  } catch {
    await env.LEADS_DB.prepare("UPDATE lead_notification_jobs SET status = 'pending', attempts = ?, last_error = 'Delivery failed.', updated_at = ? WHERE lead_id = ?").bind(attempts, nowIso, leadId).run();
    return json(503, { error: 'Notification delivery failed; queued retry.' });
  }
}
