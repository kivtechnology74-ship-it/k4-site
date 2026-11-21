# K4 Equipment Market Intelligence — ARC pilot

Purpose: **watch public gas-engine generator listings** for K4 equipment sourcing.
This is **not** a certified equipment inventory or an endorsement of any seller.

## Safety boundary

- Dedicated feature branch and PR; existing website and its source files are untouched.
- The initial collector reads the **first catalog page** of ARC Power Systems, then visits natural-gas reciprocating generator detail pages only. Diesel, turbines, BESS and transformers are excluded.
- Each record is `WEB / UNVERIFIED`. Status values such as `PENDING SALE`, `SOLD` and `PRODUCTION PROPOSAL / UNCONFIRMED` are not converted into `AVAILABLE`.
- When a listing vanishes, do **not** automatically classify it as sold. The first-page pilot cannot infer delisting or a sale.
- Results and any source serial numbers are **not committed into this public website repo**. Only summary counts appear in workflow logs. Customer notes do not belong in source code.
- Respect `robots.txt`, keep a 1.5-second delay between details, do not bypass blocked requests. Respect seller permissions, copyright and site terms.
- No auto-generated seller outreach, purchases, offers, or publication to the K4 website.

## Run / test

```bash
pip install -r tools/equipment_watch/requirements.txt
python -m unittest discover -s tools/equipment_watch -p 'test_*.py' -v
python tools/equipment_watch/arc_watch.py             # no write / local dry-run
```

## Live Google Sheets configuration

Target: existing private **K4 International Leads** workbook. The monitor creates only three isolated tabs if absent:

- `Raw Listings` — source snapshot keyed by `Source + Listing ID`; does **not** overwrite manually maintained `Equipment Market`.
- `Price & Status History` — events for first sightings and changes in material fields, with source URL.
- `Source Registry` — source catalog, cadence and last successful check.

The code uses the Google Sheets API with a **service account**, not the ChatGPT Google Drive connection. Complete these steps once:

1. In Google Cloud, enable Google Sheets API and create a service account with Sheets access. Generate its JSON key and keep it private.
2. Share the **K4 International Leads** Google Sheet with that service account's email as Editor.
3. GitHub repository settings → Secrets and variables → Actions: add secret `K4_EQUIPMENT_SERVICE_ACCOUNT_JSON` with the **entire JSON**; add repository variable `K4_EQUIPMENT_SHEET_ID` containing the spreadsheet ID.
4. Merge the tested PR into the default branch. GitHub scheduled workflows run from the **default branch**. The first run must be checked in Actions and the three tabs read back; a passing unit test is **not** proof of live syncing.

The workflow runs every 12 hours when on the default branch. Without credentials it will perform a dry-run only (if ARC permits access). It never prints credentials.

The initial records are leads from a website. Before client use, source availability, quantity, scope, price, hours and warranty still require supplier confirmation.

## Planned next iteration

Pagination, source-specific adapters for Crusader JV, Gas Engine Exchange and other suppliers; manual QA against an actual site response; structured duplicate detection by source listing ID and later by verified serial number (stored privately only); cross-check with existing manual equipment inventory; alerts for materially new or changed opportunities.
