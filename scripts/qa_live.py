#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
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
]


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
        print(f"OK {status} {route} :: {re.sub(r'<[^>]+>', '', title.group(1)).strip() if title else 'NO TITLE'}")

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

    print(f"Errors: {len(errors)}")
    for error in errors:
        print(f"ERROR {error}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
