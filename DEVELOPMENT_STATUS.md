# K4 Free Power Screening — development status

- Version: 0.2.0 — functionality frozen
- Branch: `codex/free-power-screening-20261121`
- Pull Request: being prepared against `main`; no merge requested or performed
- Latest verified HTTPS preview: https://codex-free-power-screening-2.k4-technology.pages.dev/gpu-estimate-hybrid-en/
- Production: unchanged; no production deployment performed
- Release status: PR is ready for review. Production release remains blocked until GA4 refresh confirms `project_inquiry_submitted`.
- Product KPI: qualified commercial inquiries for K4 Independent Power Analysis.

## Frozen functionality

No screening functionality or calculation logic changed in this release preparation. English and Russian pages share the existing calculation engine. The user-entered nominal peak (including PUE for IT Load) is checked against grid capacity; annual energy, average load, and equivalent full-load hours are calculated separately. Unknown inputs are not silently defaulted. The gas scenario remains unavailable without an applicable confirmed OEM curve and a project gas price with units and LHV/HHV basis.

The main CTA remains “Request Independent Power Analysis”. Energy cost remains labeled “Energy Charge Only”. The screening remains a preliminary estimate, not engineering advice, a feasibility study, or an investment recommendation.

## SEO and preview indexing changes

- Production EN URL: `https://k4-technology.com/gpu-estimate-hybrid-en/`.
- Production RU URL: `https://k4-technology.com/gpu-estimate-hybrid-ru/`.
- Each HTML page has a self-referencing canonical, production `index,follow` robots metadata, reciprocal `en`/`ru` hreflang, and `x-default` pointing to EN.
- Sitemap includes both production URLs with matching reciprocal hreflang entries. Preview URLs are not added to the sitemap.
- `functions/_middleware.js` adds `X-Robots-Tag: noindex, nofollow` to every Cloudflare Pages `*.pages.dev` deployment and leaves the primary custom domain unchanged. Middleware behavior is covered by regression tests; the deployment reports `uses_functions: true`.
- URL layout follows the existing trailing-slash directory convention.

## Verification — 2026-11-21

- Latest Pages preview deployment verified: `8aab5ab9`, branch alias https://codex-free-power-screening-2.k4-technology.pages.dev, status success; immutable preview URL: https://8aab5ab9.k4-technology.pages.dev.
- Browser loaded both EN and RU screening routes and the preview sitemap without a 404. The sitemap displayed both production URLs. The EN/RU language links and Request Independent Power Analysis CTA were present. The K4 advisory destination is live.
- New and existing automated checks: 27 tests passed across Free Screening formulas, SEO metadata/route conventions, preview noindex middleware, and remote diagnostics worker; `scripts/test_analytics.mjs` passed; `scripts/test_calculator_analytics.mjs` passed.
- No calculation core, base `gpu-estimate/` calculator, or screening UI behavior was changed.
- Deployment middleware source and host behavior are unit-tested. A separate raw HTTP header inspection was unavailable from the external probe; the browser confirmed Pages Function deployment and the page routes, while the noindex header itself is verified by the middleware test.

## Analytics status

`project_inquiry_submitted` remains gated on successful server storage and the correct inquiry form with a request reference. The analytics contract tests pass, and analytics payloads exclude project/contact values.

**GA4 status: UNVERIFIED.** A refreshed query for the event on 2026-11-21 returned no rows; Windsor.ai reported that this property uses cached data and does not allow on-request refresh. Recheck after the next scheduled GA4 refresh before production release.

## Pull Request scope

Expected changed files:

- `DEVELOPMENT_STATUS.md` — audit outcome, preview, release gate, and rollback notes.
- `gpu-estimate-hybrid-en/index.html` — EN canonical/indexability/hreflang metadata.
- `gpu-estimate-hybrid-ru/index.html` — RU canonical/indexability/hreflang metadata.
- `functions/_middleware.js` — preview-only noindex response header.
- `sitemap.xml` — production EN/RU URLs and alternate-language entries.
- `tests/free-power-screening-seo.test.mjs` — SEO and preview-indexing regression checks.
- Existing Free Screening README, shared engine/UI, and calculation regression test remain in the branch and are unchanged by this release preparation.

## Rollback plan

If post-merge SEO or route checks fail, revert this PR commit/merge commit. That removes the screening sitemap entries and production SEO metadata, restores the prior screening page metadata, and removes the preview-header middleware. No database migration, lead pipeline change, or calculation-engine change is included. Do not deploy production until the separate approval is given.

## Remaining production blockers

1. Wait for GA4 data refresh and confirm a nonzero `project_inquiry_submitted` event count for the confirmed test.
2. After merge and a separately approved production deployment, confirm both canonical URLs return 200 with indexable metadata and remain in the production sitemap.
3. Keep Cloudflare preview deployments on `*.pages.dev` non-indexable; middleware behavior is unit-tested and should be rechecked against the deployed response header during release verification.

## Model limits

The simplified annual screen does not establish utility availability. Energy Charge Only excludes demand, connection, and other charges. Full CAPEX/OPEX, reliability/outages, fuel logistics, taxes/financing, hourly dispatch, Solar/BESS, IRR, and payback are excluded. No investment recommendation is produced.
