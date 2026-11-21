# K4 Free Power Screening — development status

- Version: 0.2.0 preview candidate
- Branch: `codex/free-power-screening-20261121` (updates are made through GitHub API; source workspace remains untouched)
- Deployment: preview only; production is unchanged
- Product KPI: number of qualified commercial inquiries for K4 Independent Power Analysis; `project_inquiry_submitted` is the confirmed-submission count proxy, and qualification is reviewed by K4 after receipt.
- Public-launch readiness: implementation candidate; final preview review remains required. No production deployment was performed.

## Completed changes

- English and Russian entry pages share `gpu-estimate-hybrid-ru/screening-engine.js` and `screening-ui.js`; English is the primary international version.
- Removed default power, PUE, utilization, tariff, currency, grid capacity, date, project type, and location values. Empty is unknown; explicit valid zero stays zero; invalid values block a valid result and are labeled separately.
- Grid adequacy compares nominal facility peak demand after PUE, separately from average annual load.
- Added optional project type (AI Data Center, Mining/HPC, Industrial, Other) and country, region, city to the explicit inquiry form.
- Added user-triggered summary copy and a separate user-triggered action to include the summary in the inquiry draft. Only the final form submit transmits fields to K4.
- Main CTA is “Request Independent Power Analysis”. Grid energy cost is labeled “Energy Charge Only”.
- Existing analytics events are used; only page path and language are sent by screening-specific events. Project submission is recorded only after the existing lead-intake script receives a server response with `stored: true` and emits `lead_form_submit_success` for `power_screening_inquiry`. Email clicks are excluded.
- Gas estimation remains unavailable with a reason. No Solar/BESS/hybrid dispatch work was added.

## Formula and source basis

The screening equations follow the task's definitions and 8,760-hour year. IT Load × user PUE derives nominal facility peak; Total Facility Load is direct. Annual MWh = nominal facility peak MW × 8,760 × utilization fraction. Average MW = annual MWh / 8,760. Equivalent full-load hours = 8,760 × utilization. Energy Charge Only = annual MWh × 1,000 × user tariff per kWh, and is displayed only with tariff and currency. Grid capacity is compared with nominal facility peak. No market tariff or OEM inputs were added.

## Verification

- New Free Screening tests: 10 passed (formula, IT vs facility, peak-vs-average grid check, missing/zero/invalid values, currency requirement, optional date, analytics payload privacy, and confirmed inquiry event gate).
- Existing `cloudflare/remote-diagnostics-worker.test.js`: 8 passed.
- Existing `scripts/test_analytics.mjs`: passed.
- JavaScript syntax checks and Python HTML parsing for both language entry pages: passed.
- Browser verification on HTTPS preview `https://db76353d.k4-technology.pages.dev`: RU control case (1 MW, 100%, USD 0.10/kWh, 1 MW grid) returned 8,760 MWh, USD 876,000 Energy Charge Only, 0 MW deficit; EN Total Facility Load and IT Load calculations were reviewed. Explicit zero utilization/tariff and invalid utilization 101% were exercised; invalid input blocked calculation. Grid check used nominal peak and showed a 1 MW deficit when capacity was 9 MW for a 10 MW facility.
- Responsive layout was visually checked in Chrome desktop and Responsive mode at 390 × 844 px; summary copy and explicit inquiry-draft inclusion worked. Screenshots were captured during QA.
- Browser analytics dataLayer showed `screening_started`, `screening_completed`, `grid_capacity_deficit_detected`, and `analysis_cta_clicked` with page/language or safe CTA metadata only. `project_inquiry_submitted` was not end-to-end triggered because preview submits into K4's live lead intake; its confirmed-storage gate is covered by the regression tests.
- No production code was changed. The live server-backed form was not submitted during tests because it would create a real lead.

## Remaining limitations

The screen is a simplified annual model and does not confirm a utility offer or connection feasibility. Energy Charge Only excludes demand, connection and other charges. No full CAPEX/OPEX, reliability/outages, fuel logistics, taxes/financing, hourly dispatch, Solar/BESS, IRR or payback is calculated. There is no supported gas estimate without project-specific confirmed OEM curve and gas price with units and LHV/HHV basis. The API-backed inquiry sends user-entered contact and project information to K4 only when the user submits the form; the analytics stream receives no such details. A commercial/owner review of the latest preview is still required before production publication.
