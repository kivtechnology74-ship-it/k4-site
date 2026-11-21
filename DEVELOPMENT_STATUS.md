# K4 Free Power Screening — development status

- Version: 0.1.0 preview candidate
- Stage: preview deployed and browser smoke-check complete
- Branch: `codex/free-power-screening-20261121` (isolated from production)
- Production: unchanged; no production merge or deployment
- Preview: [Cloudflare Pages preview](https://0572ce01.k4-technology.pages.dev/gpu-estimate-hybrid-ru/) — commit `95a9cac84951c0d7937116de6069d89c6ebc862d`
- Commercial readiness: not approved for public production; copy, contact conversion, localization, and project qualification flow need owner review

## Gap analysis

- Reusable: repository static HTML/CSS/JS conventions, the existing K4 Professional Analysis route/contact path, and the hybrid calculator's established regression suite as reference.
- Blocking Free Screening: CSV/hourly and hybrid gas/BESS controls add needless work and imply cost comparability without the project inputs this screen collects. They are removed from the screening interface.
- Missing project inputs: actual facility demand and load definition, PUE if applicable, utilization, grid tariff and currency, available grid capacity, and connection schedule. These remain user-provided or explicitly unknown.
- Audit: the requested independent audit dated 2026-11-21 (F-01–F-08 and 15 scenarios) was not found in the local repository or accessible Drive search. Its defects and scenarios are therefore not asserted or represented as checked.

## Changed files

- `gpu-estimate-hybrid-ru/index.html` — single-page Free Power Screening; no CSV workflow.
- `gpu-estimate-hybrid-ru/screening-engine.js` — standalone annual energy, indicative energy bill, and grid peak-capacity comparison.
- `gpu-estimate-hybrid-ru/tests/free-screening.test.mjs` — regression and validation cases.
- `gpu-estimate-hybrid-ru/README.md` — formulas, provenance and limitations.
- The checked baseline `gpu-estimate/` is not changed.

## Inputs, sources, and formulas

- Formula source: explicit screening definitions in the task; 8,760 hours/year is used as the stated annual-hour basis.
- IT Load facility demand = user IT Load × user PUE. Total Facility Load is used directly.
- Annual energy (MWh) = facility peak demand (MW) × 8,760 × utilization fraction.
- Average load = annual MWh / 8,760. Equivalent full-load hours = 8,760 × utilization fraction.
- Grid energy cost = annual MWh × 1,000 kWh/MWh × user tariff (currency/kWh). No cost is shown if tariff is unknown.
- Network coverage compares entered available grid capacity to peak facility demand; absent capacity is “unknown”. Connection date is displayed as entered and is not monetized.
- The initial 70% utilization is a visible, editable scenario assumption, not an industry standard. Once edited, it is labeled as user input.
- Inputs are user-provided and not independently verified. No external OEM parameters, tariff benchmarks, or market values were added.
- Gas cost is “insufficient data”: no applicable confirmed project OEM curve or gas price with units and LHV/HHV basis is supplied for this screen.

## Control calculations

- IT Load 10 MW × PUE 1.30 × 70% × 8,760 = 79,716 MWh/year; average 9.1 MW; 6,132 equivalent full-load hours. At USD 0.10/kWh, energy-only grid cost = USD 7,971,600.
- Total Facility Load 10 MW × 100% × 8,760 = 87,600 MWh/year.
- For 10 MW Total Facility Load with 9 MW available grid capacity, peak shortfall = 1 MW.

## Tests and browser status

- `node --test gpu-estimate-hybrid-ru/tests/free-screening.test.mjs`: 8 passed.
- `node --test gpu-estimate-hybrid-ru/tests/hybrid-engine.test.mjs`: 16 passed in the local source snapshot; that legacy test suite is not part of the new main-based preview branch.
- `node --check gpu-estimate-hybrid-ru/screening-engine.js` and extracted inline script syntax check: passed.
- Browser verification on the HTTPS preview: IT Load 10 MW × PUE 1.30, 70% gives 79,716 MWh, 9.1 MW average, 6,132 full-load hours and USD 7,971,600 at USD 0.10/kWh; with 12 MW grid, the indicated peak shortfall is 1 MW. Total Facility Load 10 MW at 50% gives 43,800 MWh and 5 MW average; with 8 MW grid, the indicated peak shortfall is 2 MW. With tariff and grid capacity blank, energy cost and capacity coverage are shown as unknown. These are synthetic checks, not project inputs.
- Initial browser attempt with `file://` was blocked by Chrome policy; HTTPS preview was used for the smoke-check.

## Limitations and release gate

The screen excludes full CAPEX/OPEX, demand charges, reliability/outages, fuel logistics, taxes/financing, hourly dispatch, PV/BESS, investment return, IRR, and payback. It does not rank full project costs or establish that the grid connection is feasible. The result is preliminary screening only, not engineering advice, a bankable feasibility study, or an investment recommendation.

Before production publication, review the international English/Russian wording, default scenario UX, tariff units, lead/contact path, analytics/consent expectations, route/SEO strategy, and legal/commercial disclaimer. Do not promote or merge this preview without separate approval.
