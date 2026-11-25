# K4 Free Power Screening — development status

- Version: 0.2.0 — functionality frozen and published
- Pull Request: [#55](https://github.com/kivtechnology74-ship-it/k4-site/pull/55) — merged 2026-11-21
- Merge commit: `21a6f7a08d6dade2bd7f51e043c678a57d3eb6aa`
- Production deployment: `3cb3cbdc` — successful; aliases `https://k4-technology.com` and `https://www.k4-technology.com`
- Public screening (EN): https://k4-technology.com/power-screening/
- Hybrid calculator (RU): https://k4-technology.com/gpu-estimate-hybrid-ru/
- Hybrid calculator (EN): https://k4-technology.com/gpu-estimate-hybrid-en/ (conversion in progress)
- Product KPI: qualified commercial inquiries for K4 Independent Power Analysis.

## Frozen functionality

The standalone English Free Power Screening tool is served from `/power-screening/`. Its existing calculation engine and UI remain at `gpu-estimate-hybrid-ru/screening-engine.js` and `gpu-estimate-hybrid-ru/screening-ui.js`; they are not moved. The hybrid calculators are separate pages at `/gpu-estimate-hybrid-ru/` and `/gpu-estimate-hybrid-en/`.

The main CTA is “Request Independent Power Analysis”. Energy cost is labeled “Energy Charge Only”. The screening is preliminary, not engineering advice, a feasibility study, or an investment recommendation.

## SEO and preview indexing

- EN and RU pages use self-referencing canonicals on the primary domain, indexable robots metadata, reciprocal `en`/`ru` hreflang, and `x-default` pointing to EN.
- The production sitemap contains both public routes and matching language alternates. No preview URLs are in the sitemap.
- `functions/_middleware.js` adds `X-Robots-Tag: noindex, nofollow` on Cloudflare Pages `*.pages.dev` deployments and leaves the primary custom domain unchanged. Middleware behavior is regression-tested; production deployment reports `uses_functions: true`.
- Existing trailing-slash URL convention is used.

## Verification — 2026-11-21

- Cloudflare production deployment `3cb3cbdc` for merge commit `21a6f7a08d6dade2bd7f51e043c678a57d3eb6aa` completed successfully.
- Browser opened the public EN route, RU route, and production `/sitemap.xml`; no 404 observed. EN/RU language links, primary CTA and K4 advisory link were present. Sitemap lists both production routes.
- Regression suites: 27 tests passed across Free Screening formulas, SEO metadata/route conventions, preview noindex middleware, and remote diagnostics worker. `scripts/test_analytics.mjs` passed; `scripts/test_calculator_analytics.mjs` passed.
- No base `gpu-estimate/` calculator files or calculation behavior were changed.
- Browser URL policy blocked viewing `view-source:`, so production response metadata was not separately inspected in the browser; canonical, robots, hreflang, sitemap and preview middleware are covered by passing source regression tests.
- Deployed preview response header `X-Robots-Tag` has not been independently read. Function deployment and middleware tests pass; retain this as a release verification follow-up.

## Analytics status

`project_inquiry_submitted` is emitted only after confirmed server storage for the correct inquiry form and request reference. Analytics contract tests pass, and analytics payloads exclude project/contact values.

**GA4 status: UNVERIFIED.** A refreshed query on 2026-11-21 returned no rows; Windsor.ai reported cached-only data and no on-request refresh. This does not establish that the event was absent from GA4. Recheck after scheduled data refresh.

## Production release follow-up

1. Confirm a nonzero `project_inquiry_submitted` count in refreshed GA4 data.
2. Inspect a deployed preview response for `X-Robots-Tag: noindex, nofollow`.
3. Confirm production canonical/robots/hreflang through an allowed raw-response inspection or Search Console crawl report.

## Rollback plan

If route, SEO, or indexing behavior fails, revert merge commit `21a6f7a08d6dade2bd7f51e043c678a57d3eb6aa` and deploy the revert through the normal production process. This removes the new routes, sitemap entries and SEO metadata, plus preview middleware and the added screening/tests/docs. No migration is needed.

## Changed files in PR #55

- `DEVELOPMENT_STATUS.md` — release and verification status, blockers, scope and rollback.
- `functions/_middleware.js` — preview-only noindex response header.
- `gpu-estimate-hybrid-en/index.html` — hybrid EN page (conversion in progress).
- `power-screening/index.html` — English Free Power Screening page.
- `power-screening/README.md` — Free Screening documentation.
- `gpu-estimate-hybrid-ru/index.html` — RU page and production SEO metadata.
- `gpu-estimate-hybrid-ru/screening-engine.js` — shared screening calculation engine.
- `gpu-estimate-hybrid-ru/screening-ui.js` — screening UI and inquiry flow.
- `gpu-estimate-hybrid-ru/tests/free-screening.test.mjs` — calculation/event tests.
- `sitemap.xml` — production EN/RU URLs and alternate-language entries.
- `tests/free-power-screening-seo.test.mjs` — SEO and preview-indexing tests.

## Model limits

The annual model does not establish utility availability. Energy Charge Only excludes demand, connection, and other charges. Full CAPEX/OPEX, reliability/outages, fuel logistics, taxes/financing, hourly dispatch, Solar/BESS, IRR, and payback are excluded. No investment recommendation is produced.
