#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
import urllib.error
import urllib.parse
import urllib.request

ORIGIN = "https://k4-technology.com"
CACHE = "?release=j320-fix-20260914"
ROUTES = [
    "/",
    "/ru/",
    "/zh/",
    "/es/",
    "/pt-br/",
    "/insights/oml30-flare-gas/",
    "/ru/insights/oml30-flare-gas/",
    "/zh/insights/oml30-flare-gas/",
    "/services/remote-technical-review/",
    "/services/gas-engine-technical-due-diligence/",
    "/ru/services/gas-engine-technical-due-diligence/",
    "/resources/",
    "/ru/resources/",
    "/resources/used-jenbacher-quick-seller-document-request/",
    "/ru/resources/used-jenbacher-quick-seller-document-request/",
    "/resources/used-jenbacher-seller-document-request/",
    "/ru/resources/used-jenbacher-seller-document-request/",
    "/resources/used-jenbacher-inspection-checklist/",
    "/ru/resources/used-jenbacher-inspection-checklist/",
    "/resources/used-jenbacher-full-inspection-checklist/",
    "/ru/resources/used-jenbacher-full-inspection-checklist/",
    "/case-studies/",
    "/ru/case-studies/",
    "/case-studies/used-jenbacher-j320-lifecycle-verification/",
    "/ru/case-studies/used-jenbacher-j320-lifecycle-verification/",
    "/case-studies/jenbacher-j320-d21-d25-configuration-mismatch/",
    "/ru/case-studies/jenbacher-j320-d21-d25-configuration-mismatch/",
    "/case-studies/used-j320-corrosion-preservation-risk/",
    "/ru/case-studies/used-j320-corrosion-preservation-risk/",
    "/insights/",
    "/ru/insights/",
    "/insights/used-jenbacher-buying-guide/",
    "/ru/insights/used-jenbacher-buying-guide/",
    "/insights/jenbacher-j320-maintenance-cost-lifecycle/",
    "/insights/gas-engine-project-due-diligence-investors-lenders/",
    "/insights/gas-to-power-financial-model-technical-assumptions/",
    "/insights/gas-engine-commissioning-checklist/",
    "/insights/gas-engine-spare-parts-strategy/",
    "/insights/data-center-captive-gas-power-engines/",
    "/insights/onsite-gas-power-mining-hpc-due-diligence/",
    "/insights/gas-consumption-data-gas-engine-investment/",
    "/insights/gas-engine-availability-headline-percentage/",
    "/insights/gas-engine-project-checklist-purchase-operations/",
    "/ru/insights/gas-engine-project-checklist-purchase-operations/",
]

CHECKLISTS = {
    "/insights/gas-engine-project-checklist-purchase-operations/": "K4-Gas-Engine-Project-Checklist.pdf",
    "/ru/insights/gas-engine-project-checklist-purchase-operations/": "K4-Checklist-Gazoporshnevogo-Proekta-RU.pdf",
}


def get(path: str) -> tuple[int, str, str]:
    request = urllib.request.Request(ORIGIN + path + CACHE, headers={"User-Agent": "K4-release-QA/1.0", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.status, response.geturl(), response.read().decode("utf-8", "replace")


def main() -> int:
    errors: list[str] = []
    for route in ROUTES:
        try:
            status, final_url, body = get(route)
        except Exception as exc:
            errors.append(f"{route}: {exc}")
            continue
        title = re.search(r"<title>(.*?)</title>", body, re.I | re.S)
        if status != 200:
            errors.append(f"{route}: HTTP {status}")
        if not title:
            errors.append(f"{route}: missing title")
        if route != "/" and "canonical" not in body:
            errors.append(f"{route}: missing canonical")
        if route in {"/", "/ru/"}:
            if body.count('class="nav-cta"') != 1:
                errors.append(f"{route}: expected exactly one header CTA")
            if 'class="projects-poster"' not in body or "kl6ObG_N-P0" not in body:
                errors.append(f"{route}: missing branded project-video poster")
            if "youtube-nocookie.com/embed" in body:
                errors.append(f"{route}: legacy embedded player still present")
        if route in CHECKLISTS:
            pdf_name = CHECKLISTS[route]
            if body.count(f'href="/downloads/{pdf_name}"') < 3:
                errors.append(f"{route}: missing direct PDF download links")
            if body.count('data-event="checklist_pdf_download"') < 3:
                errors.append(f"{route}: missing download analytics events")
        print(f"OK {status} {route} :: {re.sub(r'<[^>]+>', '', title.group(1)).strip() if title else 'NO TITLE'}")

    for pdf_name in CHECKLISTS.values():
        pdf_path = f"/downloads/{pdf_name}"
        try:
            pdf_request = urllib.request.Request(ORIGIN + pdf_path + CACHE, headers={"User-Agent": "K4-release-QA/1.0", "Cache-Control": "no-cache"})
            with urllib.request.urlopen(pdf_request, timeout=20) as response:
                pdf_data = response.read()
                if response.status != 200 or response.headers.get_content_type() != "application/pdf" or not pdf_data.startswith(b"%PDF-"):
                    errors.append(f"{pdf_path}: invalid production response")
                else:
                    print(f"OK {response.status} {pdf_path} :: {len(pdf_data)} bytes")
        except Exception as exc:
            errors.append(f"{pdf_path}: {exc}")

    redirects = {
        "/en/resources/": "/resources/",
        "/insights/gas-engine-om-benchmark-2026/": "/insights/",
        "/ru/insights/gas-engine-om-benchmark-2026/": "/ru/insights/",
    }
    for source, expected in redirects.items():
        try:
            _, final_url, _ = get(source)
            final_path = urllib.parse.urlparse(final_url).path
            if final_path != expected:
                errors.append(f"redirect {source}: got {final_path}, expected {expected}")
            else:
                print(f"OK redirect {source} -> {expected}")
        except Exception as exc:
            errors.append(f"redirect {source}: {exc}")

    missing_path = "/definitely-not-a-real-k4-page-release-check/"
    try:
        status, _, _ = get(missing_path)
        errors.append(f"soft 404 {missing_path}: HTTP {status}, expected 404")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        if exc.code != 404:
            errors.append(f"missing route {missing_path}: HTTP {exc.code}, expected 404")
        elif "Page Not Found | K4-Technology" not in body or 'content="noindex,follow"' not in body:
            errors.append(f"missing route {missing_path}: custom 404 body not served")
        else:
            print(f"OK 404 {missing_path}")
    except Exception as exc:
        errors.append(f"missing route {missing_path}: {exc}")

    print(f"Errors: {len(errors)}")
    for error in errors:
        print(f"ERROR {error}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
