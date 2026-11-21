# K4 Free Power Screening

English (`/gpu-estimate-hybrid-en/`) and Russian (`/gpu-estimate-hybrid-ru/`) pages use one shared calculation core and UI controller. No CSV, new gas estimate, Solar, BESS, or hybrid dispatch module is included.

## Data and equations

- Numeric fields start blank. Empty means unknown; accepted zero values are retained as explicit zero; invalid values are rejected and reported.
- IT Load is multiplied by user-entered PUE to derive nominal facility peak demand. Total Facility Load is used directly.
- Annual electricity (MWh) = nominal facility peak (MW) × 8,760 × utilization fraction.
- Average annual load = annual MWh / 8,760. Equivalent full-load hours = 8,760 × utilization fraction.
- Grid adequacy compares available grid capacity against nominal facility peak demand, including PUE.
- Energy Charge Only = annual MWh × 1,000 × user-entered energy tariff/currency. No cost is shown until tariff and currency are provided; connection and demand charges remain excluded.
- Connection date and optional site details are shown as user-provided. The model assigns no time value or unsupported defaults.

## Copy, inquiry, and analytics

The user must click Copy to copy the summary. A separate Include action fills the inquiry draft; K4 receives it only after explicit submission. The form uses the existing server-backed K4 lead intake. `project_inquiry_submitted` is emitted only after the site's `lead_form_submit_success` event confirms `stored: true`, with the expected form type and a request reference. Email clicks never emit that event.

Analytics events are `screening_started`, `screening_completed`, `grid_capacity_deficit_detected`, `analysis_cta_clicked`, and server-confirmed `project_inquiry_submitted`. Their event payload includes only page path and language (or the site's standard event context), never load, tariff, currency, location, contact, date, or project description. The commercial KPI is qualified independent-analysis requests; the GA4 submission event is a count proxy, with qualification performed by K4 after receipt.

## Boundaries

Gas generation remains unavailable because this screening does not have a confirmed applicable project OEM curve or a user-entered gas tariff with units and LHV/HHV basis. The output is preliminary screening only, not engineering advice, a feasibility study, or an investment recommendation. No full CAPEX/OPEX, demand charges, grid connection fees, reliability/outages, fuel logistics, taxes/financing, hourly dispatch, Solar/BESS, IRR, or payback is calculated.
