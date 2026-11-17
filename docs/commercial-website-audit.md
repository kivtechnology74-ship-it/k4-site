# K4 website modernization and lead intake

Audit scope: repository snapshot `2d5dc09` and the connected Cloudflare Pages/Workers/D1 configuration, reviewed 17 November 2026. The Pages site changes remain in a draft PR and have not been merged or deployed to production. The separately approved notification dispatcher Worker is deployed.

## Architecture found

- Cloudflare already has a `k4-remote-diagnostics` Worker and a D1 database with a `site_leads` table. The Worker has a five-minute scheduled retry for pending email and an existing email relay secret. Existing records show successful email delivery for the site's current `site_leads` intake. A separate diagnostics table has failed email records and exhausted retries; this is an operational follow-up, not evidence that the new route has been exercised.
- Before this branch, the repository had no Pages Function for the website's general lead forms. The existing Worker handles its own `/api/remote-diagnostics` routes; it was not a shared endpoint wired to the review and new form interfaces.
- There is no Telegram integration in the inspected Worker. Its secret values are not readable through the Cloudflare API, so a preview notification cannot be tested by copying the production mailer secret.
- Cloudflare deployment configuration had no Pages variables or notification secrets. The preview Pages environment is set to use the existing signed Gmail relay contract when its dedicated relay secrets are installed; production email stays on the existing scheduled Worker to avoid double delivery.

## Changes in this branch

- Tighten the English homepage hero around the buyer's decision before capital commitment and link three clear buyer paths to existing service pages.
- Correct the J320 index to 21,008.5 engine-hours, add the existing J320 comparison article to the sitemap and add CollectionPage JSON-LD to the French case index.
- Add a same-origin Pages Function at `/api/leads`. It validates form type, locale, contact, payload size and source origin; filters attribution to campaign identifiers; ignores honeypot submissions; rate-limits by a daily IP digest that is purged after three days; and writes an idempotent row before returning success.
- Route the English homepage, English technical review and EN/RU/FR remote diagnostics forms through the new endpoint. A `lead` GA4 event is sent only after the endpoint confirms the row exists; event parameters contain page/form metadata only, never submitted fields.
- Add a shared D1 migration compatible with the existing production `site_leads` table. Cloudflare Pages is bound to the existing D1 database in production and a separate empty `k4-site-leads-preview` database in preview. Both schemas have been applied. The existing production Worker is expected to process pending email rows on its schedule.
- Add a notification status record per lead. Pages stores only a lead reference and one-time dispatch token in Cloudflare Queues; the full lead remains in D1. The deployed dispatcher Worker calls a token-authenticated Pages callback, which claims the job before sending to avoid concurrent duplicate dispatch.
- Configure a dead-letter queue and up to 12 delivery retries at five-minute intervals. Preview email uses the signed relay contract; production email remains on the existing five-minute scheduled Worker. Telegram can be sent in either environment when its protected credentials are configured.

## Remaining P0 work

- No notification secrets are currently configured on Pages. Preview email needs its own relay URL and secret; Telegram needs a bot token and chat ID in both preview and production. Secret values were not read or copied from the existing Worker.
- Preview and production Pages notification credentials are absent. Preview relay URL/secret and Telegram bot/chat credentials, plus production Telegram credentials, must be configured before notification delivery can be accepted. The queue infrastructure is ready but no live email or Telegram receipt has been verified.
- Preview commit `94e3a69` built successfully with Pages Functions, isolated D1 and the Queue producer enabled. A marked request on an earlier preview was confirmed as one row in preview D1 and remains pending. A live duplicate POST and actual notification receipt remain unverified; duplicate request handling passed the local endpoint harness.

## QA limits

Release QA passed after the form changes. Cloudflare preview commit `94e3a69` built successfully with `uses_functions=true`, the isolated D1 binding and Queue producer. Desktop/mobile visual QA has not been completed. A successful D1 write alone is not a successful notification or a complete lead-to-opportunity process.
