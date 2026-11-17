# K4 website modernization — initial audit

Audit scope: local `origin/main` snapshot (`2d5dc09`, 17 November 2026). The working tree used for this audit is an isolated branch. Production and the pre-existing local checkout were not changed.

## Findings

| Priority | Finding | Commercial effect | Proposed response | Risk / dependency |
| --- | --- | --- | --- | --- |
| P0 | The static site has no server-side lead endpoint or persistent lead store. The technical review and remote diagnostics forms construct a `mailto:` link; the visitor must send it themselves. | K4 cannot verify receipt, recover an unsent request, or report a confirmed lead. | Add a server endpoint, durable database record, notification delivery and retry queue; emit a success event only after the record is committed. | Requires an approved Cloudflare Pages D1 binding, database creation/migration, Telegram bot credentials and recipient configuration. Email needs a configured delivery provider. No credentials or bindings are present in this repository, so delivery cannot be tested here. |
| P0 | Forms on EN/RU/FR diagnostics and the EN review route are browser-only. No CRM or lead log exists in the checked-in project. | Leads depend on the visitor's mail application and manual follow-through. | Route every form through the same validated endpoint, store attribution and page context, and confirm receipt only after durable storage. | This audit does not claim any delivery integration is operational. |
| P1 | The English homepage already describes owner-side advisory and three lifecycle capabilities, but the hero leads with a broad expertise statement and its first actions do not directly distinguish project development, equipment purchase and operating assets. | A first-time buyer may need to infer which route matches their decision. | State the pre-capital decision value in the hero and link the three buyer paths to existing service pages. Keep AI/data-center advisory visible as a specific use case. | Copy must remain within the evidence and service scope already published. |
| P1 | Service and case-study routes already cover gas-engine advisory, due diligence, lifecycle/reliability, AI power and J320/J612 evidence. Independence and evidence limits are stated on relevant pages. | Useful proof exists, but routes and CTA coverage are not yet a consistent end-to-end funnel. | Inventory/link audit should map each service to its cases, technical resources and one next action before adding new content. | Avoid rewriting case data or inferring outcomes not present in source material. |
| P2 | `assets/intelligence.js` loads GA4 `G-7ZWVHK5XV9`; it records `lead_form_start`, legacy CTA/contact events and `lead_form_mailto_open`. It does not record a server-confirmed submission. | CTA activity can be distinguished from a sent email, but there is no authoritative lead event or opportunity/revenue connection. | Preserve the existing measurement ID; add normalized click events only where the current event model can be retained, then tie success to server storage. Never send form fields to GA4. | No server event should be emitted until the endpoint exists; production analytics configuration cannot be verified from source alone. |
| P2 | Static HTML/CSS/JS, no package manager/build step; Cloudflare Pages is the documented hosting path. Canonicals, hreflang, sitemap and robots are present. | Low deployment complexity and existing SEO equity should be preserved. | Use additive Pages Functions and D1 only after the Pages project binding is configured; retain current routes and verify with release/live QA. | A local static QA pass cannot prove Cloudflare deployment, D1 binding, email/Telegram receipt, or Core Web Vitals. |

## Initial implementation in this branch

- Tighten the English homepage hero around the buyer's decision before capital commitment.
- Add three explicit routes for power-project development, equipment verification and operating-asset improvement, linking to existing services and corroborating cases.
- Align the J320 index card with the case study's corrected 21,008.5 engine-hours, add the existing J320 comparison article to the sitemap, and add valid CollectionPage JSON-LD to the French case index.
- No production deployment, external message, test lead, or credential access was performed.

## Lead delivery acceptance still required

1. Create/bind a Cloudflare D1 database for both production and preview environments and apply the lead schema.
2. Configure Telegram bot token/chat ID as protected secrets and select/configure an email delivery provider for `ceo@k4-technology.com`.
3. Implement/test idempotent writes, server validation, spam controls, notification retries and retention/access policy.
4. Submit a clearly marked TEST request on preview; confirm its database record and actual notification receipt before claiming the lead system works.

