const RETRY_DELAY_SECONDS = 300;

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

export default {
  async queue(batch) {
    for (const message of batch.messages) {
      const { callbackUrl, leadId, dispatchToken } = message.body || {};
      if (!isAllowedCallback(callbackUrl) || !/^[a-zA-Z0-9_-]{16,80}$/.test(String(leadId || '')) || String(dispatchToken || '').length < 32) {
        message.ack();
        continue;
      }
      try {
        const response = await fetch(callbackUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ leadId, dispatchToken }),
        });
        if (!response.ok) message.retry({ delaySeconds: RETRY_DELAY_SECONDS });
        else message.ack();
      } catch {
        message.retry({ delaySeconds: RETRY_DELAY_SECONDS });
      }
    }
  },
};
