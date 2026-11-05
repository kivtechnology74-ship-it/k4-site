#!/usr/bin/env python3
"""K4 ARC Power Systems listing monitor. Public listings only; supplier claims remain unverified."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse
from urllib import robotparser

import requests
from bs4 import BeautifulSoup

SOURCE = "ARC Power Systems"
ROOT = "https://www.arcpowersystems.com"
CATALOG = ROOT + "/listings"
USER_AGENT = "K4EquipmentWatch/0.1 (+https://k4-technology.com; commercial market research)"
LISTING_PATTERN = re.compile(r"^/listings/(\d+)-[^/]+/?$")
TIMEOUT = 25
RAW_TAB = "Raw Listings"
HISTORY_TAB = "Price & Status History"
SOURCES_TAB = "Source Registry"

RAW_HEADERS = [
    "Source", "Listing ID", "Stock ID", "Title", "Manufacturer", "Model",
    "Quantity", "Power kW", "Year", "Operating Hours", "Condition", "Voltage", "Frequency Hz", "Fuel",
    "Price", "Currency", "Location", "Seller Status", "Verification",
    "Source URL", "First Seen UTC", "Last Seen UTC", "Fingerprint", "Notes",
]
HISTORY_HEADERS = [
    "Observed UTC", "Source", "Listing ID", "Event", "Old Status",
    "New Status", "Changed Fields", "Source URL",
]
SOURCES_HEADERS = [
    "Source", "Catalog URL", "Frequency", "Status", "Last Successful Check UTC", "Notes",
]
MATERIAL_KEYS = [
    "stock_id", "manufacturer", "model", "quantity", "power_kw", "year", "operating_hours", "condition", "voltage",
    "frequency_hz", "fuel", "price", "currency", "location", "seller_status",
]
NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
}
EXCLUDE = ("diesel", "turbine", "battery", "bess", "transformer", "hfo", "lfo")


def normalized_space(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def current_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def normalize_link(href: str) -> tuple[str, str] | None:
    url = urljoin(ROOT, href).split("?")[0].split("#")[0]
    parsed = urlparse(url)
    if parsed.hostname not in {"arcpowersystems.com", "www.arcpowersystems.com"}:
        return None
    match = LISTING_PATTERN.match(parsed.path)
    return (match.group(1), url) if match else None


def candidate_title(title: str) -> bool:
    name = title.lower()
    return not any(word in name for word in EXCLUDE) and (
        "natural gas" in name or "gas generator" in name or
        ("gas" in name and any(m in name for m in ("jenbacher", "mwm", "cat ", "caterpillar", "waukesha", "cummins", "mtu")))
    )


def extract_catalog_links(html: str) -> list[tuple[str, str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    candidates: dict[str, tuple[str, str, str]] = {}
    for tag in soup.select("a[href]"):
        normalized = normalize_link(tag.get("href", ""))
        if not normalized:
            continue
        listing_id, link = normalized
        title = normalized_space(tag.get_text(" ", strip=True))
        if not candidate_title(title):
            continue
        if listing_id not in candidates or len(title) > len(candidates[listing_id][2]):
            candidates[listing_id] = (listing_id, link, title)
    return list(candidates.values())


def specs_from_html(soup: BeautifulSoup) -> dict[str, str]:
    specs: dict[str, str] = {}
    for tr in soup.select("tr"):
        cells = tr.find_all(["th", "td"], recursive=False)
        if len(cells) >= 2:
            key = normalized_space(cells[0].get_text(" ", strip=True)).lower().rstrip(":")
            val = normalized_space(cells[1].get_text(" ", strip=True))
            if key and val and len(key) <= 90:
                specs[key] = val
    for dt in soup.select("dt"):
        dd = dt.find_next_sibling("dd")
        if dd:
            specs[normalized_space(dt.get_text(" ", strip=True)).lower().rstrip(":")] = normalized_space(dd.get_text(" ", strip=True))
    return specs


def get_spec(specs: dict[str, str], *names: str) -> str:
    for name in names:
        value = specs.get(name.lower())
        if value:
            return value
    return ""


def first_number(text: str) -> int | None:
    match = re.search(r"(?<!\d)(\d[\d,]*)", text or "")
    return int(match.group(1).replace(",", "")) if match else None


def quantity_value(text: str) -> int | None:
    value = (text or "").strip().lower()
    for word, number in NUMBER_WORDS.items():
        if re.search(r"\b" + word + r"\b", value):
            return number
    return first_number(value)


def price_from_text(text: str) -> int | None:
    match = re.search(r"\$\s*(\d{1,3}(?:,\d{3})+|\d{5,9})(?:\s*\(?USD\)?)?", text)
    return int(match.group(1).replace(",", "")) if match else None


def seller_status(text: str) -> str:
    first = text[:2600].upper()
    if re.search(r"\bPENDING SALE\b|\bSALE PENDING\b", first):
        return "PENDING SALE"
    if re.search(r"\bSOLD\b", first):
        return "SOLD"
    if "FACTORY-PRODUCTION" in text.upper() or "MANUFACTURING ALLOCATION" in text.upper():
        return "PRODUCTION PROPOSAL / UNCONFIRMED"
    return "ADVERTISED / UNCONFIRMED"


def parse_detail(listing_id: str, url: str, catalog_title: str, html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    h1 = soup.find("h1")
    title = normalized_space(h1.get_text(" ", strip=True)) if h1 else catalog_title
    # Restrict text to the listing's main body when present. Avoid confusing
    # navigation/menu categories with the item's actual specification.
    main = soup.find("main") or soup.find("article") or soup
    text = normalized_space(main.get_text(" ", strip=True))
    specs = specs_from_html(soup)

    manufacturer = get_spec(specs, "manufacturer", "make")
    if not manufacturer:
        manufacturer = next((m for m in ("Caterpillar", "Jenbacher", "MWM", "Waukesha", "Cummins", "MTU") if m.lower() in title.lower()), "")
    model = get_spec(specs, "model", "engine model", "genset package model")
    if not model:
        m = re.search(r"\b(?:G3520[A-Z]?|G351[26][A-Z]?|JGS?\s*4\d{2}|TCG\s*20\d{2}\s*V\d{2}|L7042GSI)\b", title, flags=re.I)
        model = normalized_space(m.group(0)) if m else ""
    qty = quantity_value(get_spec(specs, "quantity available"))
    if qty is None:
        m = re.search(r"\b(\d+)\s+available\b|[\(\[](\d+)[\)\]]\s*(?:cat|caterpillar|jenbacher|mwm|gas)", title, re.I)
        if m:
            qty = int(next(g for g in m.groups() if g))
    power = first_number(get_spec(specs, "kw", "rated power", "rated output"))
    if not power:
        m = re.search(r"(\d[\d,]*)\s*kW\b", title, re.I)
        power = int(m.group(1).replace(",", "")) if m else None
    location = get_spec(specs, "location")
    if not location:
        m = re.search(r"\bLocation\s*:\s*([A-Za-z,.\s]+?)(?:\s+or\b|\s+Call\b|\s+Description\b)", text, re.I)
        location = normalized_space(m.group(1)) if m else ""
    year = first_number(get_spec(specs, "year"))
    if not year:
        m = re.search(r"\b(20\d{2}|19\d{2})\b", title)
        year = int(m.group(1)) if m else None
    voltage = get_spec(specs, "voltage (v)", "voltage")
    frequency = first_number(get_spec(specs, "frequency (hz)", "frequency"))
    if not frequency:
        m = re.search(r"\b(50|60)\s*Hz\b", title)
        frequency = int(m.group(1)) if m else None
    stock = get_spec(specs, "stock number", "stock#", "stock no")
    if not stock:
        m = re.search(r"\bARC\d{3,6}\b", text)
        stock = m.group(0) if m else ""
    price = price_from_text(text[:2500])
    status = seller_status(text)
    result = {
        "source": SOURCE, "listing_id": listing_id, "stock_id": stock, "title": title,
        "manufacturer": manufacturer, "model": model, "quantity": qty, "power_kw": power,
        "year": year, "operating_hours": first_number(get_spec(specs, "operating hours", "running hours", "engine hours", "hours")),
        "condition": get_spec(specs, "condition detail", "condition"), "voltage": voltage, "frequency_hz": frequency,
        "fuel": get_spec(specs, "fuel type", "fuel") or "Natural Gas (per listing)",
        "price": price, "currency": "USD" if price is not None else "",
        "location": location, "seller_status": status,
        "verification": "WEB / UNVERIFIED", "url": url,
        "notes": "Supplier listing only. No independently verified stock, price, hours or warranty.",
    }
    result["fingerprint"] = hashlib.sha256(
        json.dumps({k: result.get(k) for k in MATERIAL_KEYS}, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()[:20]
    return result


def robots_check(session: requests.Session) -> None:
    response = session.get(ROOT + "/robots.txt", timeout=TIMEOUT)
    if response.status_code == 404:
        return
    response.raise_for_status()
    parser = robotparser.RobotFileParser()
    parser.parse(response.text.splitlines())
    for url in [CATALOG]:
        if not parser.can_fetch(USER_AGENT, url):
            raise RuntimeError("robots.txt does not permit this crawler to fetch " + url)


def crawl(max_details: int, delay: float) -> list[dict]:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"})
    robots_check(session)
    response = session.get(CATALOG, timeout=TIMEOUT)
    response.raise_for_status()
    links = extract_catalog_links(response.text)
    if not links:
        raise RuntimeError("No relevant natural-gas listing links detected: check ARC catalog markup.")
    records: list[dict] = []
    for listing_id, url, title in links[:max_details]:
        time.sleep(delay)
        page = session.get(url, timeout=TIMEOUT)
        page.raise_for_status()
        records.append(parse_detail(listing_id, url, title, page.text))
    return records


def row_for(record: dict, first_seen: str, seen: str) -> list:
    row = [
        record["source"], record["listing_id"], record["stock_id"], record["title"],
        record["manufacturer"], record["model"], record["quantity"], record["power_kw"],
        record["year"], record["operating_hours"], record["condition"], record["voltage"], record["frequency_hz"], record["fuel"],
        record["price"], record["currency"], record["location"], record["seller_status"],
        record["verification"], record["url"], first_seen, seen,
        record["fingerprint"], record["notes"],
    ]
    return [v if v is not None else "" for v in row]


def send_json(session, method: str, url: str, body: dict | None = None) -> dict:
    response = session.request(method, url, json=body, timeout=TIMEOUT)
    response.raise_for_status()
    return response.json() if response.text.strip() else {}


def sync_sheets(records: list[dict], sheet_id: str, credentials_json: str) -> dict:
    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession

    credentials = service_account.Credentials.from_service_account_info(
        json.loads(credentials_json),
        scopes=["https://www.googleapis.com/auth/spreadsheets"],
    )
    session = AuthorizedSession(credentials)
    api = "https://sheets.googleapis.com/v4/spreadsheets/" + sheet_id
    meta = send_json(session, "GET", api + "?fields=sheets.properties")
    existing_tabs = {s["properties"]["title"] for s in meta.get("sheets", [])}
    target_tabs = {RAW_TAB: RAW_HEADERS, HISTORY_TAB: HISTORY_HEADERS, SOURCES_TAB: SOURCES_HEADERS}
    missing = [tab for tab in target_tabs if tab not in existing_tabs]
    if missing:
        send_json(session, "POST", api + ":batchUpdate", {
            "requests": [{"addSheet": {"properties": {"title": name}}} for name in missing]
        })

    def get_values(tab: str, rng: str) -> list[list]:
        url = api + "/values/" + requests.utils.quote(f"'{tab}'!{rng}", safe="!:'")
        return send_json(session, "GET", url).get("values", [])

    def update_values(tab: str, start_range: str, values: list[list]) -> None:
        url = api + "/values/" + requests.utils.quote(f"'{tab}'!{start_range}", safe="!:'") + "?valueInputOption=RAW"
        send_json(session, "PUT", url, {"range": f"'{tab}'!{start_range}", "majorDimension": "ROWS", "values": values})

    def append_values(tab: str, values: list[list]) -> None:
        if not values:
            return
        url = api + "/values/" + requests.utils.quote(f"'{tab}'!A:Z", safe="!:'") + ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS"
        send_json(session, "POST", url, {"majorDimension": "ROWS", "values": values})

    raw = get_values(RAW_TAB, "A1:X5000")
    if not raw:
        update_values(RAW_TAB, "A1:X1", [RAW_HEADERS])
        raw = [RAW_HEADERS]
    if raw[0] != RAW_HEADERS:
        raise RuntimeError("Raw Listings header does not match expected schema. Refusing to overwrite.")
    if not get_values(HISTORY_TAB, "A1:H1"):
        update_values(HISTORY_TAB, "A1:H1", [HISTORY_HEADERS])
    if not get_values(SOURCES_TAB, "A1:F1"):
        update_values(SOURCES_TAB, "A1:F1", [SOURCES_HEADERS])

    by_key = {}
    for i, values in enumerate(raw[1:], start=2):
        if len(values) > 1 and values[0] and values[1]:
            by_key[(str(values[0]), str(values[1]))] = (i, values)

    observed = current_utc()
    additions: list[list] = []
    histories: list[list] = []
    updates: list[dict] = []
    n_changes = 0
    for record in records:
        key = (record["source"], record["listing_id"])
        old = by_key.get(key)
        if old:
            row_number, previous = old
            first_seen = previous[20] if len(previous) > 20 else observed
            status_before = previous[17] if len(previous) > 17 else ""
            fingerprint_before = previous[22] if len(previous) > 22 else ""
            new_row = row_for(record, first_seen, observed)
            updates.append({
                "range": f"'{RAW_TAB}'!A{row_number}:X{row_number}",
                "majorDimension": "ROWS", "values": [new_row],
            })
            if fingerprint_before != record["fingerprint"]:
                changed = [RAW_HEADERS[j] for j in (2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17)
                           if (previous[j] if len(previous) > j else "") != (new_row[j] if new_row[j] is not None else "")]
                histories.append([observed, SOURCE, record["listing_id"], "CHANGED", status_before,
                                  record["seller_status"], ", ".join(changed), record["url"]])
                n_changes += 1
        else:
            additions.append(row_for(record, observed, observed))
            histories.append([observed, SOURCE, record["listing_id"], "NEW", "",
                              record["seller_status"], "New listing seen", record["url"]])

    if updates:
        send_json(session, "POST", api + "/values:batchUpdate", {
            "valueInputOption": "RAW", "data": updates
        })
    append_values(RAW_TAB, additions)
    append_values(HISTORY_TAB, histories)

    sources = get_values(SOURCES_TAB, "A1:F500")
    source_row = next((i for i, row in enumerate(sources, start=1) if row and row[0] == SOURCE), None)
    source_record = [SOURCE, CATALOG, "12h", "PILOT / WEB UNVERIFIED", observed,
                     "First-page natural-gas listings only; unlisted != sold; seller confirmation required"]
    if source_row:
        update_values(SOURCES_TAB, f"A{source_row}:F{source_row}", [source_record])
    else:
        append_values(SOURCES_TAB, [source_record])
    return {"found": len(records), "new": len(additions), "changed": n_changes, "updated": len(updates)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Monitor ARC natural-gas generator listings; Sheets writing opt-in")
    parser.add_argument("--write", action="store_true", help="Sync to private Google Sheet (requires credentials)")
    parser.add_argument("--max-details", type=int, default=30)
    parser.add_argument("--delay", type=float, default=1.5)
    args = parser.parse_args()
    if args.max_details < 1 or args.max_details > 100 or args.delay < 0.5:
        parser.error("max-details must be 1..100 and delay >= 0.5 seconds")
    records = crawl(args.max_details, args.delay)
    if args.write:
        secret = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "")
        sheet = os.getenv("K4_EQUIPMENT_SHEET_ID", "")
        if not secret or not sheet:
            raise RuntimeError("Sheets sync not configured: GOOGLE_SERVICE_ACCOUNT_JSON and K4_EQUIPMENT_SHEET_ID required.")
        result = sync_sheets(records, sheet, secret)
        print(json.dumps({"mode": "sheet_write", **result}, ensure_ascii=False))
    else:
        print(json.dumps({"mode": "dry_run", "count": len(records),
                          "listings": [{k: r.get(k) for k in ("listing_id", "model", "quantity", "power_kw", "seller_status", "url")}
                                       for r in records]}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # Fail the scheduled job rather than silently claiming a successful scan.
        print(f"Equipment watch failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
