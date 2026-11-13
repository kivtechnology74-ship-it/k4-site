# K4 lead delivery setup

`remote-diagnostics-worker.js` serves the existing `/api/remote-diagnostics` route. Every accepted form submission is first saved in the existing D1 database, then sent through a signed Google Apps Script relay to `ceo@k4-technology.com`. The sender is the existing Gmail account. Each form requires only a valid email address or phone number; all other details are optional. The saved row includes UTC receipt time, language, source page, timezone and allowed UTM/ad attribution. The browser sends only non-identifying form metadata to GA4.

## Email relay

The Apps Script project is named `K4 Website Lead Email Relay`. It accepts only requests signed with the Worker secret, rejects old timestamps, serializes deliveries, and deduplicates a request reference for six hours. It sends only to the fixed K4 CEO address. The Worker keeps the relay secret encrypted and retries failures on its five-minute schedule. The free consumer Gmail MailApp quota is 100 recipients/day; this can change under Google's quota policy.

The relay must be deployed as a web app that runs as the owner and accepts requests from anyone. Keep the shared HMAC secret private in the Apps Script project and the Worker's encrypted secret configuration. Do not put it in the website or GA4.

## Apply and deploy

From the repository root, apply the D1 migration and deploy the Worker after the Apps Script deployment URL has been configured:

```sh
npx wrangler d1 migrations apply k4-remote-diagnostics --remote --config cloudflare/wrangler.jsonc
npx wrangler secret put GMAIL_RELAY_SECRET --config cloudflare/wrangler.jsonc
npx wrangler deploy --config cloudflare/wrangler.jsonc
```

Set `GMAIL_RELAY_URL` to the deployed Apps Script URL in the Worker environment. Cloudflare Pages deploys form changes from `main` after merge; do not enable the new form script before the Worker and D1 migration are active.

The scheduled retry retries pending emails with increasing backoff and records delivery attempts/status. Existing diagnostic cases saved by the earlier Worker are retried through the same relay. Exhausted failures remain stored in D1 and are written to Worker logs with a request reference, never with customer contact data.

## Verification

Use a clearly synthetic test from the preview site after configuring the relay. Confirm the D1 row and email to the CEO mailbox before promoting the Pages change. Do not use a real customer's data for the test.
