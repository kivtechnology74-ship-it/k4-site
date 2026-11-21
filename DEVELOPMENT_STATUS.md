# K4 Free Power Screening — development status

- Version: 0.2.0 — functionality frozen
- Branch: `codex/free-power-screening-20261121` (GitHub API updates; original local workspace untouched)
- Latest HTTPS preview reviewed: https://1b875439.k4-technology.pages.dev/gpu-estimate-hybrid-ru/
- Production: unchanged; no production deployment performed
- Readiness: NOT READY for public production launch. SEO/indexability and live analytics verification remain open.
- Product KPI: qualified commercial inquiries for K4 Independent Power Analysis.

## Frozen functionality

Bilingual English/Russian Free Power Screening remains a simple annual screening. No new functions or calculation modules were added during final audit. EN and RU use the same calculation engine. The user-entered nominal peak (including PUE for IT Load) is checked against grid capacity; annual energy, average load and equivalent full-load hours are calculated separately. Tariffs, PUE, utilization, capacity and location are not silently defaulted. Gas generation stays unavailable without an applicable confirmed OEM curve and project gas price with units and LHV/HHV basis.

The primary CTA is “Request Independent Power Analysis”. Energy cost is labeled “Energy Charge Only”. Project/contact data is sent to K4 only after an explicit inquiry submission, never through screening analytics. No EPC, equipment sales, Solar/BESS, full dispatch, IRR or payback module is part of this screening.

## Final pre-publication audit — 2026-11-21

### Test inquiry receipt

One test request, explicitly marked `INTERNAL TEST`, was submitted through the HTTPS preview. The form confirmed storage with reference `DD4104C1`. The K4 website lead notification was found in the connected K4 inbox, addressed to `ceo@k4-technology.com`, with status NEW, matching reference, form type and INTERNAL TEST marker. No second test request was sent.

### Analytics

The event code emits `project_inquiry_submitted` only after `lead_form_submit_success` for `power_screening_inquiry` with a server request reference; email clicks and unsuccessful attempts are excluded. This confirmed-storage gate is regression-tested.

The connected GA4 query for 2026-11-21 returned no event rows and indicated cached data without force refresh. Therefore the actual GA4 arrival of this specific submission event is NOT confirmed; verify after the next GA4 data refresh. Analytics payloads contain only page path/language or safe event metadata, not project/contact inputs.

### SEO and indexability

- EN metadata: title “K4 Free Power Screening”; description present.
- RU metadata: title “K4 Free Power Screening | Предварительная оценка мощности”; description present.
- Both screening HTML pages currently specify `noindex,follow`; neither has a canonical URL or hreflang links.
- Production robots.txt allows general search crawling and points to https://k4-technology.com/sitemap.xml.
- The production sitemap does not list either future screening URL. The current production URL /gpu-estimate-hybrid-en/ returns 404; the production RU route is not live either.
- Consequently, the screening pages are not currently indexable on production. Before publication, decide production canonical URLs, add reciprocal EN/RU hreflang (and x-default if intended), set production indexing directives, and include both URLs in the sitemap. Keep preview deployment out of the production sitemap.
- Existing AI Power Project Advisory page has title/description/canonical and EN/x-default hreflang. Its page explicitly says K4 is not the EPC contractor and provides independent owner-side technical advice/review. It discusses new/used equipment selection and supplier proposals as analysis topics; it does not state that K4 sells EPC or equipment. The screening's commercial CTA is analysis-led.

### Regression checks

- Free Screening regression tests: 10 passed.
- Existing remote diagnostics worker tests: 8 passed.
- Existing analytics contract: passed.
- Combined run of the new and existing suites: 28 passed, 0 failed (the Free Screening suite is included twice in the combined command).
- HTTPS browser smoke: base GPU Estimate page loaded on the latest preview; the “Demonstration example: 10 × J320” action populated the model and produced calculated values, including 82,050,313 kWh/year, 108,091,919 ₽ average annual EBITDA, and 4.2-year simple payback. No edits were made to the base GPU calculator.
- Commit review confirms Free Screening changes are confined to its bilingual pages/shared engine and UI/tests/documentation; the base `gpu-estimate/` calculator was not modified.

## Commercial wording

The screening describes a preliminary power-demand and grid-capacity check and directs users to “Request Independent Power Analysis.” K4's linked advisory describes independent owner-side technical review and explicitly disclaims EPC delivery. Its references to engines/equipment are framed as selection and proposal review, not equipment sales. No performance, savings, investment-return or availability claims are made by Free Screening.

## Remaining limitations and production gate

This simplified annual screen does not confirm utility availability. Energy Charge Only excludes demand, connection and other charges. Full CAPEX/OPEX, reliability/outages, fuel logistics, taxes/financing, hourly dispatch, Solar/BESS and investment return are excluded. The model is not engineering advice, a feasibility study or an investment recommendation.

Do not publish until production canonical/hreflang/indexing/sitemap handling is prepared and verified, and `project_inquiry_submitted` is observed in refreshed GA4 data. Production remains untouched pending the user's separate publication approval.
