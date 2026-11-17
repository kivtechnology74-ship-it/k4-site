# K4 website modernization and lead intake

Audit scope: repository snapshot `2d5dc09` and the connected Cloudflare Pages/Workers/D1 configuration, reviewed 17 November 2026. This branch is a draft PR; it has not been merged or deployed to production.

## Architecture found

- Cloudflare already has a `k4-remote-diagnostics` Worker and a D1 database with a `site_leads` table. The Worker has a five-minute scheduled retry for pending email and an existing email relay secret. Existing records show successful email delivery for the site's current `site_leads` intake. A separate diagnostics table has failed email records and exhausted retries; this is an operational follow-up, not evidence that the new route has been exercised.
- Before this branch, the repository had no Pages Function for the website's general lead forms. The existing Worker handles its own `/api/remote-diagnostics` routes; it was not a shared endpoint wired to the review and new form interfaces.
- There is no Telegram integration in the inspected Worker. Its secret values are not readable through the Cloudflare API, so a preview notification cannot be tested by copying the production mailer secret.

## Changes in this branch

- Tighten the English homepage hero around the buyer's decision before capital commitment and link three clear buyer paths to existing service pages.
- Correct the J320 index to 21,008.5 engine-hours, add the existing J320 comparison article to the sitemap and add CollectionPage JSON-LD to the French case index.
- Add a same-origin Pages Function at `/api/leads`. It validates form type, locale, contact, payload size and source origin; filters attribution to campaign identifiers; ignores honeypot submissions; rate-limits by a daily IP digest that is purged after three days; and writes an idempotent row before returning success.
- Route the English homepage, English technical review and EN/RU/FR remote diagnostics forms through the new endpoint. A `lead` GA4 event is sent only after the endpoint confirms the row exists; event parameters contain page/form metadata only, never submitted fields.
- Add a shared D1 migration compatible with the existing production `site_leads` table. Cloudflare Pages is bound to the existing D1 database in production and a separate empty `k4-site-leads-preview` database in preview. Both schemas have been applied. The existing production Worker is expected to process pending email rows on its schedule.

## Remaining P0 work

- Telegram delivery is not configured. Bot token and chat ID must be added as protected Cloudflare secrets before Telegram can be claimed as a working channel.
- Preview email delivery and retry have not been connected to an isolated preview worker. The existing email relay secret is unavailable for reading/copying, and production credentials must not be attached to preview or exercised by a test request.
- A preview test still needs to verify a marked request is stored once after a repeated submission, and to verify notification delivery. The storage test must use only the preview binding. Production deploy and merge remain out of scope.

## QA limits

The previous release QA run covered the static HTML in the initial branch. Cloudflare preview success proves Pages built the prior commit; it does not verify this new Pages Function or preview D1 binding. No desktop/mobile visual review is claimed. A successful D1 write alone is not a successful notification or a complete lead-to-opportunity process.
