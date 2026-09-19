#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
ORIGIN = "https://k4-technology.com"


class AuditParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []
        self.canonical: list[str] = []
        self.hreflang: list[tuple[str, str]] = []
        self.titles: list[str] = []
        self.h1 = 0
        self.meta_description = 0
        self.jsonld: list[str] = []
        self._capture_title = False
        self._capture_jsonld = False
        self._buffer: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = dict(attrs)
        if tag == "a" and data.get("href"):
            self.links.append(data["href"] or "")
        if tag == "link" and data.get("rel") == "canonical" and data.get("href"):
            self.canonical.append(data["href"] or "")
        if tag == "link" and data.get("rel") == "alternate" and data.get("hreflang") and data.get("href"):
            self.hreflang.append((data["hreflang"] or "", data["href"] or ""))
        if tag == "meta" and data.get("name") == "description" and data.get("content"):
            self.meta_description += 1
        if tag == "h1":
            self.h1 += 1
        if tag == "title":
            self._capture_title = True
            self._buffer = []
        if tag == "script" and data.get("type") == "application/ld+json":
            self._capture_jsonld = True
            self._buffer = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "title" and self._capture_title:
            self.titles.append("".join(self._buffer).strip())
            self._capture_title = False
        if tag == "script" and self._capture_jsonld:
            self.jsonld.append("".join(self._buffer).strip())
            self._capture_jsonld = False

    def handle_data(self, data: str) -> None:
        if self._capture_title or self._capture_jsonld:
            self._buffer.append(data)


def public_path(file: Path) -> str:
    rel = file.relative_to(ROOT)
    if rel.name == "index.html":
        parent = rel.parent.as_posix()
        return "/" if parent == "." else f"/{parent}/"
    return f"/{rel.as_posix()}"


def route_target(path: str) -> Path:
    clean = path.split("?", 1)[0].split("#", 1)[0]
    if clean == "/":
        return ROOT / "index.html"
    candidate = ROOT / clean.lstrip("/")
    if clean.endswith("/"):
        return candidate / "index.html"
    if candidate.suffix:
        return candidate
    return candidate / "index.html"


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []
    titles: dict[str, str] = {}
    html_files = sorted(ROOT.rglob("*.html"))
    substantive = [p for p in html_files if any(part in {"resources", "case-studies", "services", "insights"} for part in p.parts)]
    for file in html_files:
        raw = file.read_text(encoding="utf-8")
        parser = AuditParser()
        parser.feed(raw)
        route = public_path(file)
        for href in parser.links:
            parsed = urlparse(href)
            if parsed.scheme in {"http", "https", "mailto", "tel", "javascript"} or href.startswith("#"):
                continue
            if not href.startswith("/"):
                warnings.append(f"relative internal link: {route} -> {href}")
                continue
            if not route_target(href).exists():
                errors.append(f"broken link: {route} -> {href}")
        if file in substantive:
            if len(parser.titles) != 1 or not parser.titles[0]:
                errors.append(f"title count at {route}: {len(parser.titles)}")
            elif parser.titles[0] in titles:
                errors.append(f"duplicate title: {route} and {titles[parser.titles[0]]}")
            else:
                titles[parser.titles[0]] = route
            if parser.meta_description != 1:
                errors.append(f"meta description count at {route}: {parser.meta_description}")
            if len(parser.canonical) != 1:
                errors.append(f"canonical count at {route}: {len(parser.canonical)}")
            elif parser.canonical[0] != ORIGIN + route:
                errors.append(f"canonical mismatch at {route}: {parser.canonical[0]}")
            if parser.h1 != 1:
                errors.append(f"h1 count at {route}: {parser.h1}")
            if not parser.jsonld:
                errors.append(f"missing JSON-LD at {route}")
            for block in parser.jsonld:
                try:
                    json.loads(block)
                except json.JSONDecodeError as exc:
                    errors.append(f"invalid JSON-LD at {route}: {exc}")

    sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    required = {
        "/services/gas-engine-technical-due-diligence/",
        "/ru/services/gas-engine-technical-due-diligence/",
        "/resources/",
        "/ru/resources/",
        "/case-studies/",
        "/ru/case-studies/",
        "/insights/used-jenbacher-buying-guide/",
        "/ru/insights/used-jenbacher-buying-guide/",
        "/insights/jenbacher-j320-maintenance-cost-lifecycle/",
    }
    for route in required:
        if not route_target(route).exists():
            errors.append(f"missing required route: {route}")
        if ORIGIN + route not in sitemap:
            errors.append(f"route absent from sitemap: {route}")
    prohibited_routes = [
        ROOT / "insights/gas-engine-om-benchmark-2026/index.html",
        ROOT / "ru/insights/gas-engine-om-benchmark-2026/index.html",
        ROOT / "case-studies/case-03/index.html",
        ROOT / "case-studies/case-04/index.html",
    ]
    for file in prohibited_routes:
        if file.exists():
            errors.append(f"prohibited public file remains: {file.relative_to(ROOT)}")

    searchable = "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in html_files if "oml30-flare-gas" not in p.as_posix())
    for pattern in [r"Independent Gas Engine", r"Independent Technical", r"Global Gas Engine O&M Benchmark", r"€225k", r"universal 2,000 h"]:
        if re.search(pattern, searchable, re.I):
            errors.append(f"prohibited public phrase: {pattern}")

    print(f"HTML files: {len(html_files)}")
    print(f"Substantive pages audited: {len(substantive)}")
    print(f"Warnings: {len(warnings)}")
    for item in warnings:
        print(f"WARN {item}")
    print(f"Errors: {len(errors)}")
    for item in errors:
        print(f"ERROR {item}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
