# K4 calculator conversion analytics

## Sources and privacy

- GA4 uses the site's existing `G-7ZWVHK5XV9` tag loaded by `assets/intelligence.js`. Calculator pages load that shared script; no second GA4 tag or second page-view event is added.
- Cloudflare D1 is the primary event store (`calculator_events`) and the existing `/api/remote-diagnostics` form handler remains the source of truth for stored leads.
- Calculator event payloads contain only opaque event/session/calculation UUIDs; route, language, calculator version, profile class, and public model metadata. They never contain project names, contact fields, tariffs, hours, load, unit counts, CAPEX, EBITDA, payback, or other project figures.
- GA4 receives event names and model/profile/language/version dimensions. It does not receive `calc_id`; the form URL parameter is transferred to a hidden field and stripped before GA4's page view.
- D1 writes require a valid origin, a 4 KB payload limit, an IP rate limit (60/minute), schema allowlists and event ID deduplication. D1 event failures do not interrupt calculation or lead submission.
- The site now uses a first-party consent banner on every HTML route. Consent or refusal is stored for six months; Google tags are not loaded until acceptance. Analytics consent is separate from access to calculator, PDF and contact forms, and can be changed in the footer. `navigator.doNotTrack` suppresses analytics even after acceptance. Internal traffic is derived server-side from the `k4_internal=1` cookie and stored in the dedicated `internal_traffic` field. Do not treat the absence of `bot=1` as proof of a human.

## Event meaning

| Event | Rule |
| --- | --- |
| `calculator_page_view` | One D1 page view per page load; GA4 page view comes from the existing GA config. |
| `calculator_started` | First trusted user edit or model selection. Initialization and scripted demo fills do not start the funnel. |
| `calculator_model_selected` | A user change to a catalog/manual model. |
| `calculator_result_completed` | Debounced 650 ms after user input when generation, horizon, fuel, all operating costs, heat assumptions and a finite economic result are valid. Demo profiles are excluded. A changed scenario receives a new `calc_id`; keystrokes do not emit repeated completions. |
| `calculator_pdf_clicked` | Trusted click on the existing PDF/print action after a valid result. This records the click only; it does not claim the browser saved a file. |
| `calculator_contact_clicked` | Click on the K4 CTA after a valid result. Navigation waits for the D1 completion acknowledgement (up to 1.5 seconds); a failed analytics request still allows the form to open. |
| `generate_lead` | Emitted only after the existing Worker confirms the D1 lead row is stored and its `calc_id` resolves to a production completion. Email delivery status is not required for storage. |

Profiles use `oem`, `incomplete`, `manual`, or `demo`. `traffic_class` separates production, QA, and probable automation; `profile_type=demo` separately marks demonstration scenarios, including demos run on a Preview. The funnel and popularity queries exclude demo profiles. `probable_automation` is a conservative User-Agent heuristic. The system deliberately makes no positive “real person” classification.

## D1 deployment

Migrations: `cloudflare/migrations/0003_calculator_analytics.sql` and `cloudflare/migrations/0004_calculator_internal_traffic.sql`.

Apply both migrations to the Worker D1 before the production Worker deploy:

```sh
npx wrangler d1 migrations apply k4-remote-diagnostics --remote --config cloudflare/wrangler.jsonc
```

Migration 0003 creates `calculator_events`, `calculator_completions`, indexes, and a nullable FK `site_leads.calc_id`; migration 0004 adds a first-party internal traffic flag and report index. It also adds `site_leads.qualification_status` (`unreviewed` by default); set `qualified` only after a human or CRM process confirms fit. Existing rows stay unreviewed.

The Pages project has a separate Preview `LEADS_DB` binding. The `functions/api/calculator-events.js` route is limited to branch Preview hostnames and uses that binding; the custom production domain continues to use the existing Worker route. Apply the same migration to the Pages Preview database before exercising preview event writes. Production migration and Worker deployment remain separate release actions.

The isolated `k4-site-leads-preview` database received migration `0003` on 2026-11-21 for synthetic verification. The production `k4-remote-diagnostics` database was not changed.

## Reporting

Run `reports/calculator-funnel.sql` with inclusive UTC start and exclusive UTC end bound as `?1` and `?2`. Sequential session stages require each event to follow the previous one in the same session. PDF event volume is reported separately from deduplicated completed scenarios with a PDF click, preventing repeat clicks from inflating the conversion rate. Stored leads and qualified leads are counts of successfully stored lead rows; linked calculator scenarios are also deduplicated. Internal traffic, QA, demos and probable automation remain visible in the segmentation audit but are excluded from production conversion rates.

Example only, synthetic interval `2026-11-01T00:00:00Z` to `2026-12-01T00:00:00Z`:

| Traffic sessions | Started | Model selected | Completed | PDF clicks | Lead stored | Qualified | Traffic→started | Started→model | Model→completed | Completed→PDF | Completed→stored | Stored→qualified |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,200 | 108 | 74 | 42 | 19 | 5 | 2 | 9.0% | 68.5% | 56.8% | 45.2% | 11.9% | 40.0% |

Synthetic model sample: Jenbacher J320 — 21 selections / 13 completions; Caterpillar G3516 — 15 / 9; Manual profile — 8 / 4; other models — 30 / 16. These values are examples, not measured K4 traffic.

## QA verification

- Client and Worker tests verify event gates, payload allowlists, migration behavior, deduplication, storage-failure handling, rate limits, Preview routing, and production-only attribution after lead storage. The lead form itself was not submitted during browser QA, so no inquiry was created or sent.
- Verified on 2026-11-21 in the deployed branch Preview: RU and EN browser flows emitted `calculator_page_view`, `calculator_started`, `calculator_model_selected`, and `calculator_result_completed` for synthetic QA calculations. Both languages recorded `calculator_pdf_clicked` on the existing PDF/print button. The event means the button was clicked; the browser print flow does not prove that a file was downloaded.
- GA4 DebugView received the QA calculator event stream, including page view, start, model selection, completion, and PDF-click events. The existing site GA4 configuration was reused; QA events carry `calculator_traffic_class=qa` and `debug_mode=true`, while production events omit `debug_mode`.
- Preview D1, after migration `0003` was applied to the isolated Preview database, stored matching RU and EN QA events with model ID/name, profile class, language, calculator version and `traffic_class=qa`. It did not store project figures or personal data.
- Browser checks covered RU and EN at mobile size, EN at desktop size, RU desktop event flow, model switching, valid completion and PDF-button clicks. Client/Worker tests cover duplicate/recalculation behavior, analytics consent and write failures, request limits, and lead attribution only after successful storage. No real or synthetic lead was sent through the form.
- The Preview Function rate limiter is local to an isolate; production requests use the Cloudflare Worker rate-limit binding. Preview forms write to Preview D1 and suppress email delivery. Production release requires the production backup, migrations, Worker and Pages deployment sequence in PR #53.
