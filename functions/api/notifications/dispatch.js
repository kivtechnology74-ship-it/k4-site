import { sendEmailThroughRelay } from '../../_shared/notifications.js';

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
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

  const nowIso = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const claim = await env.LEADS_DB.prepare(`
    UPDATE lead_notification_jobs SET status = 'processing', attempts = attempts + 1, updated_at = ?
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
  if (!lead) {
    await env.LEADS_DB.prepare("UPDATE lead_notification_jobs SET status = 'failed', last_error = 'Lead record is missing.', updated_at = ? WHERE lead_id = ?").bind(nowIso, leadId).run();
    return json(404, { error: 'Lead record is missing.' });
  }

  try {
    if (lead.email_status !== 'sent') {
      if (env.LEAD_EMAIL_MODE === 'direct') {
        if (!env.GMAIL_RELAY_URL || !env.GMAIL_RELAY_SECRET) throw new Error('Email relay is not configured.');
        await sendEmailThroughRelay(lead, env);
        await env.LEADS_DB.prepare("UPDATE site_leads SET email_status = 'sent', email_attempts = email_attempts + 1, email_error = NULL, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), leadId).run();
      } else {
        throw new Error('Email is pending delivery by the existing scheduled mailer.');
      }
    }
    await env.LEADS_DB.prepare("UPDATE lead_notification_jobs SET status = 'sent', last_error = NULL, updated_at = ? WHERE lead_id = ?").bind(new Date().toISOString(), leadId).run();
    return json(200, { success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email delivery failed.';
    const reason = message.includes('not configured')
      ? message
      : message.includes('pending delivery')
        ? message
        : 'Email relay delivery failed.';
    await env.LEADS_DB.prepare("UPDATE site_leads SET email_status = 'pending', email_attempts = email_attempts + ?, email_error = ?, next_attempt_at = ?, updated_at = ? WHERE id = ?")
      .bind(env.LEAD_EMAIL_MODE === 'direct' ? 1 : 0, reason, new Date(Date.now() + 5 * 60 * 1000).toISOString(), new Date().toISOString(), leadId).run();
    await env.LEADS_DB.prepare("UPDATE lead_notification_jobs SET status = 'pending', last_error = ?, updated_at = ? WHERE lead_id = ?")
      .bind(reason, new Date().toISOString(), leadId).run();
    return json(503, { error: 'Email delivery is pending retry.' });
  }
}
