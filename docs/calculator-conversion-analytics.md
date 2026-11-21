# K4 calculator conversion analytics

## Sources and privacy

- GA4 uses the site's existing `G-7ZWVHK5XV9` tag loaded by `assets/intelligence.js`. Calculator pages load that shared script; no second GA4 tag or second page-view event is added.
- Cloudflare D1 is the primary event store (`calculator_events`) and the existing `/api/remote-diagnostics` form handler remains the source of truth for stored leads.
- Calculator event payloads contain only opaque event/session/calculation UUIDs; route, language, calculator version, profile class, and public model metadata. They never contain project names, contact fields, tariffs, hours, load, unit counts, CAPEX, EBITDA, payback, or other project figures.
- GA4 receives event names and model/profile/language/version dimensions. It does not receive `calc_id`; the form URL parameter is transferred to a hidden field and stripped before GA4's page view.
- D1 writes require a valid origin, a 4 KB payload limit, an IP rate limit (60/minute), schema allowlists and event ID deduplication. D1 event failures do not interrupt calculation or lead submission.
- The helper honors `navigator.doNotTrack === '1'` and an explicit `window.k4AnalyticsConsent === false` signal. No cookie banner/CMP or Consent Mode default was found in this repository; if a CMP is introduced, it must set this flag before calculator analytics runs. Do not treat the absence of `bot=1` as proof of a human.

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

Profiles use `oem`, `incomplete`, `manual`, or `demo`. `traffic_class` separates production, QA, demo and probable automation; `profile_type=demo` separately marks demonstration scenarios, including demos run in QA. QA takes precedence when a demo is used on a preview. The funnel and popularity queries exclude demo profiles. `probable_automation` is a conservative User-Agent heuristic. The system deliberately makes no positive “real person” classification.

## D1 deployment

Migration: `cloudflare/migrations/0003_calculator_analytics.sql`.

Apply it before deploying the Worker and Pages change:

```sh
npx wrangler d1 migrations apply k4-remote-diagnostics --remote --config cloudflare/wrangler.jsonc
```

The migration creates `calculator_events`, `calculator_completions`, indexes, and a nullable FK `site_leads.calc_id`. It also adds `site_leads.qualification_status` (`unreviewed` by default); set `qualified` only after a human or CRM process confirms fit. Existing rows stay unreviewed. No D1 migration or Worker deployment was run as part of this change.

## Reporting

Run `reports/calculator-funnel.sql` with inclusive UTC start and exclusive UTC end bound as `?1` and `?2`. The first query reports Traffic → Started → Model Selected → Completed → PDF Clicked → Lead Stored → Qualified Lead plus stage conversion rates. The second reports popular models. The third keeps QA, demo and probable automation visible for audit.

Example only, synthetic interval `2026-11-01T00:00:00Z` to `2026-12-01T00:00:00Z`:

| Traffic sessions | Started | Model selected | Completed | PDF clicks | Lead stored | Qualified | Traffic→started | Started→model | Model→completed | Completed→PDF | Completed→stored | Stored→qualified |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,200 | 108 | 74 | 42 | 19 | 5 | 2 | 9.0% | 68.5% | 56.8% | 45.2% | 11.9% | 40.0% |

Synthetic model sample: Jenbacher J320 — 21 selections / 13 completions; Caterpillar G3516 — 15 / 9; Manual profile — 8 / 4; other models — 30 / 16. These values are examples, not measured K4 traffic.

## QA still required before release

- Unit and static checks can verify event gates, payload allowlists, migrations, deduplication, storage-failure behavior, and form attribution without sending a real client request.
- GA4 DebugView requires a controlled session using `?qa=1` or `utm_source=codex_internal_test&utm_medium=qa`; verify the six calculator events and confirm there is one page view and one GA4 config. This repository change cannot verify property access, live DebugView reception, or data filters.
- A Cloudflare preview with the migration applied is required to prove production-like D1 writes and Worker rate limits. No preview deployment, remote migration, production deploy, or real inquiry is part of this PR.
- Recheck RU/EN at desktop/mobile sizes, repeated recalculation, model changes, blocked analytics, event-write failure, PDF click, and form-store failure using synthetic-only contacts before release.
