#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urljoin, urlparse
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parent.parent
ORIGIN = "https://k4-technology.com"
TRACKED_ARTICLE_ROUTES = {
    "/insights/gas-engine-project-due-diligence-investors-lenders/",
    "/insights/gas-to-power-financial-model-technical-assumptions/",
    "/insights/south-africa-5gw-gas-to-power-determination-engines-vs-turbines/",
    "/insights/iso-rating-site-derate-gas-engines-turbines/",
    "/insights/time-to-dependable-power-ai-data-centers/",
    "/insights/gas-engine-commissioning-checklist/",
    "/insights/gas-engine-spare-parts-strategy/",
    "/insights/data-center-captive-gas-power-engines/",
    "/insights/onsite-gas-power-mining-hpc-due-diligence/",
    "/insights/gas-consumption-data-gas-engine-investment/",
    "/insights/gas-engine-availability-headline-percentage/",
    "/insights/gas-engine-project-checklist-purchase-operations/",
    "/ru/insights/gas-engine-project-checklist-purchase-operations/",
}
ALLOWED_ANALYTICS_EVENTS = {
    "ai_power_cta_click",
    "ai_power_evidence_click",
    "article_cta_click",
    "checklist_landing_click",
    "checklist_pdf_download",
    "developer_advisory_click",
    "engaged_30s",
    "engaged_60s",
    "file_download",
    "lead_contact_click",
    "lead_form_mailto_open",
    "lead_form_start",
    "lifecycle_reliability_click",
    "not_found_cta_click",
    "not_found_navigation",
    "power_project_cta_click",
    "project_os_interest_click",
    "scroll_50",
    "scroll_90",
    "service_review_cta_click",
}
KNOWN_BROKEN_REDIRECTS = {
    "/case-studies/j320-303-days-": "/case-studies/j320-303-days-operating-data/",
    "/case-studies/j320-303-days-operating-": "/case-studies/j320-303-days-operating-data/",
    "/case-": "/case-studies/",
    "/insights/gas-engine-": "/insights/gas-engine-availability-headline-percentage/",
    "/insights/data-center-captive-gas-power-": "/insights/data-center-captive-gas-power-engines/",
}
UTM_KEYS = {"utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"}
UTM_VALUE = re.compile(r"^[a-z0-9]+(?:_[a-z0-9]+)*$")
ANALYTICS_ASSET_VERSION = "20261026-1"


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
        self.ids: set[str] = set()
        self.tracked_events: list[dict[str, str | None]] = []
        self._capture_title = False
        self._capture_jsonld = False
        self._buffer: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = dict(attrs)
        if tag == "a" and data.get("href"):
            self.links.append(data["href"] or "")
        if data.get("id"):
            self.ids.add(data["id"] or "")
        if data.get("data-event"):
            self.tracked_events.append(data)
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
    parsed_pages: dict[Path, AuditParser] = {}
    substantive = [p for p in html_files if any(part in {"resources", "case-studies", "services", "insights"} for part in p.parts)]
    for file in html_files:
        raw = file.read_text(encoding="utf-8")
        parser = AuditParser()
        parser.feed(raw)
        parsed_pages[file] = parser
        route = public_path(file)
        if route in TRACKED_ARTICLE_ROUTES and raw.count('data-event="article_cta_click"') < 2:
            errors.append(f"missing tracked article CTAs at {route}")
        for href in parser.links:
            parsed = urlparse(href)
            browser_url = urlparse(urljoin(ORIGIN + route, href))
            query = parse_qsl(browser_url.query, keep_blank_values=True)
            query_keys = [key for key, _ in query]
            if "amp;utm_" in browser_url.geturl() or any(key.startswith("amp;utm_") for key in query_keys):
                errors.append(f"literal amp;utm_ in browser URL: {route} -> {href}")
            present_utm = [(key, value) for key, value in query if key.startswith("utm_")]
            if present_utm and "utm_source" not in query_keys:
                errors.append(f"campaign URL lacks utm_source: {route} -> {href}")
            for key, value in present_utm:
                if key not in UTM_KEYS:
                    errors.append(f"unknown UTM parameter {key}: {route} -> {href}")
                elif not UTM_VALUE.fullmatch(value):
                    errors.append(f"UTM value is not lowercase snake_case: {route} -> {key}={value}")
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

    for file, parser in parsed_pages.items():
        route = public_path(file)
        hreflang_codes: set[str] = set()
        for language, href in parser.hreflang:
            if language in hreflang_codes:
                errors.append(f"duplicate hreflang {language} at {route}")
            hreflang_codes.add(language)
            alternate = urlparse(href)
            if alternate.scheme != "https" or alternate.netloc != "k4-technology.com":
                errors.append(f"invalid hreflang URL at {route}: {href}")
            elif not route_target(alternate.path).exists():
                errors.append(f"hreflang target is missing at {route}: {href}")
        for event in parser.tracked_events:
            event_name = event.get("data-event") or ""
            if event_name not in ALLOWED_ANALYTICS_EVENTS:
                errors.append(f"unknown analytics event {event_name} at {route}")
            for attribute in ["data-location", "data-channel", "data-language"]:
                if not event.get(attribute):
                    errors.append(f"{event_name} lacks {attribute} at {route}")
        for href in parser.links:
            parsed = urlparse(href)
            if parsed.scheme or not parsed.fragment:
                continue
            target = file if not parsed.path else route_target(parsed.path)
            if target.exists() and target.suffix == ".html":
                target_parser = parsed_pages.get(target)
                if target_parser is None:
                    target_parser = AuditParser()
                    target_parser.feed(target.read_text(encoding="utf-8"))
                if unquote(parsed.fragment) not in target_parser.ids:
                    errors.append(f"broken fragment: {route} -> {href}")

    sitemap_path = ROOT / "sitemap.xml"
    sitemap = sitemap_path.read_text(encoding="utf-8")
    sitemap_urls: list[str] = []
    try:
        sitemap_root = ElementTree.fromstring(sitemap)
        sitemap_ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        sitemap_urls = [node.text or "" for node in sitemap_root.findall("s:url/s:loc", sitemap_ns)]
        if len(sitemap_urls) != len(set(sitemap_urls)):
            errors.append("duplicate URL in sitemap.xml")
        for sitemap_url in sitemap_urls:
            parsed_url = urlparse(sitemap_url)
            if parsed_url.scheme != "https" or parsed_url.netloc != "k4-technology.com":
                errors.append(f"non-canonical sitemap URL: {sitemap_url}")
            elif not route_target(parsed_url.path).exists():
                errors.append(f"sitemap URL has no local page: {sitemap_url}")
    except ElementTree.ParseError as exc:
        errors.append(f"invalid sitemap.xml: {exc}")
    not_found = ROOT / "404.html"
    if not not_found.exists():
        errors.append("missing custom 404.html")
    else:
        not_found_html = not_found.read_text(encoding="utf-8")
        if 'name="robots" content="noindex,follow"' not in not_found_html:
            errors.append("404.html must be noindex,follow")
        if '<h1>' not in not_found_html:
            errors.append("404.html is missing an h1")
    required = {
        "/services/remote-technical-review/",
        "/services/ai-power-project-advisory/",
        "/services/gas-engine-technical-due-diligence/",
        "/ru/services/gas-engine-technical-due-diligence/",
        "/resources/",
        "/ru/resources/",
        "/case-studies/",
        "/ru/case-studies/",
        "/insights/used-jenbacher-buying-guide/",
        "/ru/insights/used-jenbacher-buying-guide/",
        "/insights/jenbacher-j320-maintenance-cost-lifecycle/",
        "/insights/verify-used-jenbacher-operating-hours/",
        "/insights/jenbacher-borescope-inspection/",
        "/insights/used-gas-engine-acceptance-red-flags/",
        "/insights/used-jenbacher-fleet-serial-verification/",
        "/insights/gas-engine-project-due-diligence-investors-lenders/",
        "/insights/gas-to-power-financial-model-technical-assumptions/",
        "/insights/south-africa-5gw-gas-to-power-determination-engines-vs-turbines/",
        "/insights/iso-rating-site-derate-gas-engines-turbines/",
        "/insights/time-to-dependable-power-ai-data-centers/",
        "/resources/dependable-it-mw-ai-data-centers/",
        "/insights/gas-engine-commissioning-checklist/",
        "/insights/gas-engine-spare-parts-strategy/",
        "/insights/data-center-captive-gas-power-engines/",
        "/insights/onsite-gas-power-mining-hpc-due-diligence/",
        "/insights/gas-consumption-data-gas-engine-investment/",
        "/insights/gas-engine-availability-headline-percentage/",
        "/insights/gas-engine-project-checklist-purchase-operations/",
        "/insights/k4-project-os-design-partner/",
        "/insights/ai-compute-power-reality-check/",
        "/ru/insights/ai-compute-power-reality-check/",
        "/ru/insights/gas-engine-project-checklist-purchase-operations/",
    }
    for route in required:
        if not route_target(route).exists():
            errors.append(f"missing required route: {route}")
        if ORIGIN + route not in sitemap:
            errors.append(f"route absent from sitemap: {route}")

    ai_route = "/services/ai-power-project-advisory/"
    ai_page = route_target(ai_route).read_text(encoding="utf-8")
    ai_required_tokens = [
        "Confidence in the power-system choice before major capital is committed.",
        "K4 does not act as the EPC contractor.",
        'data-event="ai_power_cta_click"',
        'data-event="ai_power_evidence_click"',
        'data-channel="email"',
        'data-channel="whatsapp"',
        'data-channel="telegram"',
        'data-language="en"',
        'href="https://k4-technology.com/services/ai-power-project-advisory/"',
        'hreflang="en"',
        'hreflang="x-default"',
        '"@id":"https://k4-technology.com/#organization"',
        '"@id":"https://k4-technology.com/#igor-shibanov"',
        '"@id":"https://k4-technology.com/services/ai-power-project-advisory/#service"',
        "Last reviewed: 11 October 2026",
    ]
    for token in ai_required_tokens:
        if token not in ai_page:
            errors.append(f"AI Power page is missing required content: {token}")
    for prohibited in ["K4 completed an AI data-center project", "K4 delivered an AI data-center project", "guaranteed AI indexing"]:
        if prohibited.lower() in ai_page.lower():
            errors.append(f"unsupported AI Power claim: {prohibited}")

    for file in html_files:
        raw = file.read_text(encoding="utf-8")
        if '<html lang="en"' in raw and (' data-nav' in raw or 'id="primary-links"' in raw):
            if raw.count('href="/services/ai-power-project-advisory/"') < 1:
                errors.append(f"English global navigation lacks AI Power: {file.relative_to(ROOT)}")
    for locale in ["ru", "zh", "es", "pt-br"]:
        for file in (ROOT / locale).rglob("*.html"):
            if ">AI Power</a>" in file.read_text(encoding="utf-8"):
                errors.append(f"AI Power added to non-English navigation: {file.relative_to(ROOT)}")

    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    for crawler in ["Googlebot", "Bingbot", "GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot"]:
        if f"User-agent: {crawler}" not in robots:
            errors.append(f"robots.txt lacks explicit allowed crawler: {crawler}")
    llms = (ROOT / "llms.txt").read_text(encoding="utf-8")
    if ORIGIN + ai_route not in llms or "K4 does not act as the EPC contractor" not in llms:
        errors.append("llms.txt AI Power entry is missing or inconsistent")
    headers = (ROOT / "_headers").read_text(encoding="utf-8")
    for header in ["Strict-Transport-Security", "Content-Security-Policy", "Permissions-Policy", "frame-ancestors 'none'", "X-Content-Type-Options", "Referrer-Policy"]:
        if header not in headers:
            errors.append(f"_headers is missing {header}")
    prohibited_routes = [
        ROOT / "insights/gas-engine-om-benchmark-2026/index.html",
        ROOT / "ru/insights/gas-engine-om-benchmark-2026/index.html",
        ROOT / "case-studies/case-03/index.html",
        ROOT / "case-studies/case-04/index.html",
    ]
    for file in prohibited_routes:
        if file.exists():
            errors.append(f"prohibited public file remains: {file.relative_to(ROOT)}")

    checklists = {
        "/insights/gas-engine-project-checklist-purchase-operations/": "K4-Gas-Engine-Project-Checklist.pdf",
        "/ru/insights/gas-engine-project-checklist-purchase-operations/": "K4-Checklist-Gazoporshnevogo-Proekta-RU.pdf",
    }
    for checklist_route, pdf_name in checklists.items():
        checklist_html = route_target(checklist_route).read_text(encoding="utf-8")
        checklist_pdf = ROOT / "downloads" / pdf_name
        if not checklist_pdf.exists() or checklist_pdf.stat().st_size < 10_000:
            errors.append(f"missing or unexpectedly small checklist PDF: {pdf_name}")
        if checklist_html.count(f'href="/downloads/{pdf_name}"') < 3:
            errors.append(f"{checklist_route}: must provide three direct PDF download links")
        if checklist_html.count('data-event="checklist_pdf_download"') < 3:
            errors.append(f"{checklist_route}: PDF download tracking is incomplete")
        if checklist_html.count(" download") < 3:
            errors.append(f"{checklist_route}: PDF links must use the download attribute")

    intelligence = (ROOT / "assets/intelligence.js").read_text(encoding="utf-8")
    analytics_tokens = [
        "G-7ZWVHK5XV9",
        "__k4IntelligenceLoaded",
        "k4_internal",
        "traffic_type",
        "debug_mode",
        "codex_internal_test",
        "utm_medium",
        "page_path",
        "page_type",
        "service_slug",
        "case_slug",
        "article_slug",
        "contact_type",
        "cta_location",
        "service_review_cta_click",
        "article_cta_click",
        "file_download",
        "file_name",
        "file_url",
        "link_url",
        "lead_form_start",
        "lead_form_mailto_open",
        "lead_contact_click",
        "engaged_30s",
        "engaged_60s",
        "scroll_50",
        "scroll_90",
        "analyticsContext",
        "safeLinkUrl",
    ]
    for token in analytics_tokens:
        if token not in intelligence:
            errors.append(f"analytics implementation is missing {token}")
    if re.search(r"track\(\s*['\"]file_download['\"]", intelligence):
        errors.append("file_download must come only from GA4 Enhanced Measurement")
    for event_name in re.findall(r"track(?:Once)?\(\s*['\"]([^'\"]+)['\"]", intelligence):
        if event_name not in ALLOWED_ANALYTICS_EVENTS:
            errors.append(f"unknown analytics event in intelligence.js: {event_name}")
    for false_lead_event in ["equipment_form_submit", "lead_form_submit_success", "generate_lead"]:
        if false_lead_event in intelligence:
            errors.append(f"mailto flow must not claim successful lead event: {false_lead_event}")
    for file in html_files:
        raw = file.read_text(encoding="utf-8")
        route = public_path(file)
        intelligence_count = raw.count('/assets/intelligence.js')
        if intelligence_count != 1:
            errors.append(
                f"shared analytics script must appear exactly once at {route} (found {intelligence_count})"
            )
        versioned_intelligence_count = raw.count(
            f"/assets/intelligence.js?v={ANALYTICS_ASSET_VERSION}"
        )
        if versioned_intelligence_count != 1:
            errors.append(
                f"analytics asset version mismatch at {route} "
                f"(expected {ANALYTICS_ASSET_VERSION})"
            )
        if "googletagmanager.com/gtag/js" in raw or re.search(r"gtag\(['\"]config['\"]", raw):
            errors.append(f"inline GA bootstrap remains at {route}")

    redirects_text = (ROOT / "_redirects").read_text(encoding="utf-8")
    for broken_path, canonical_path in KNOWN_BROKEN_REDIRECTS.items():
        expected_line = f"{broken_path} {canonical_path} 301"
        if expected_line not in redirects_text.splitlines():
            errors.append(f"missing exact damaged-path redirect: {expected_line}")
        for file, parser in parsed_pages.items():
            for href in parser.links:
                if urlparse(href).path == broken_path:
                    errors.append(f"known damaged path linked at {public_path(file)}: {broken_path}")
        if any(urlparse(url).path == broken_path for url in sitemap_urls):
            errors.append(f"known damaged path present in sitemap: {broken_path}")
    wildcard_redirects = []
    for line in redirects_text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        source = line.split()[0]
        if "*" in source and any(broken.startswith(source.split("*", 1)[0]) for broken in KNOWN_BROKEN_REDIRECTS):
            wildcard_redirects.append(line)
    if wildcard_redirects:
        errors.append(f"damaged paths must not use wildcard redirects: {wildcard_redirects}")

    for command, label in [
        (["node", "scripts/campaign_urls.mjs"], "campaign URL validation"),
        (["node", "scripts/test_analytics.mjs"], "analytics contract tests"),
    ]:
        try:
            result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, timeout=30, check=False)
        except (OSError, subprocess.TimeoutExpired) as exc:
            errors.append(f"{label} could not run: {exc}")
            continue
        if result.returncode:
            errors.append(f"{label} failed: {(result.stdout + result.stderr).strip()}")

    promoted_articles = [
        p for p in (ROOT / "insights").glob("*/index.html")
        if 'class="checklist-promo"' in p.read_text(encoding="utf-8")
    ]
    if len(promoted_articles) != 12:
        errors.append(f"expected checklist promotion in 12 English articles, found {len(promoted_articles)}")
    for page in promoted_articles:
        html = page.read_text(encoding="utf-8")
        if 'data-event="checklist_landing_click"' not in html:
            errors.append(f"checklist promotion lacks analytics: {page.relative_to(ROOT)}")

    distribution_pages = {
        "index.html": "/insights/gas-engine-project-checklist-purchase-operations/",
        "ru/index.html": "/ru/insights/gas-engine-project-checklist-purchase-operations/",
        "resources/index.html": "/insights/gas-engine-project-checklist-purchase-operations/",
        "ru/resources/index.html": "/ru/insights/gas-engine-project-checklist-purchase-operations/",
        "services/gas-engine-technical-due-diligence/index.html": "/insights/gas-engine-project-checklist-purchase-operations/",
        "ru/services/gas-engine-technical-due-diligence/index.html": "/ru/insights/gas-engine-project-checklist-purchase-operations/",
        "services/remote-technical-review/index.html": "/insights/gas-engine-project-checklist-purchase-operations/",
    }
    for page, target in distribution_pages.items():
        html = (ROOT / page).read_text(encoding="utf-8")
        if target not in html or 'data-event="checklist_landing_click"' not in html:
            errors.append(f"checklist distribution is incomplete at {page}")

    ru_service = (ROOT / "ru/services/gas-engine-technical-due-diligence/index.html").read_text(encoding="utf-8")
    if ru_service.count('data-event="lead_contact_click"') < 2:
        errors.append("Russian due-diligence service needs tracked WhatsApp and email lead actions")

    searchable = "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in html_files if "oml30-flare-gas" not in p.as_posix())
    for pattern in [r"Independent Gas Engine", r"Independent Technical", r"Global Gas Engine O&M Benchmark", r"€225k", r"universal 2,000 h"]:
        if re.search(pattern, searchable, re.I):
            errors.append(f"prohibited public phrase: {pattern}")

    editorial_artifacts = [
        r"Commercial CTA",
        r"Suggested related K4-Technology content",
        r"new master article",
        r">PRIMARY CTA<",
    ]
    for pattern in editorial_artifacts:
        for file in html_files:
            if re.search(pattern, file.read_text(encoding="utf-8", errors="ignore"), re.I):
                errors.append(f"editorial artifact in {file.relative_to(ROOT)}: {pattern}")

    for file in html_files:
        if re.search(r"_{20,}", file.read_text(encoding="utf-8", errors="ignore")):
            errors.append(f"long underscore field can cause mobile overflow: {file.relative_to(ROOT)}")

    oml_pages = {
        "en": ROOT / "insights/oml30-flare-gas/index.html",
        "ru": ROOT / "ru/insights/oml30-flare-gas/index.html",
        "zh": ROOT / "zh/insights/oml30-flare-gas/index.html",
    }
    for language, page in oml_pages.items():
        html = page.read_text(encoding="utf-8")
        if "data:image" in html:
            errors.append(f"embedded OML 30 figure remains: {page.relative_to(ROOT)}")
        for number in range(1, 5):
            figure = ROOT / f"assets/oml30/{language}/figure-{number}.png"
            expected_src = f'/assets/oml30/{language}/figure-{number}.png'
            if not figure.exists() or figure.stat().st_size < 10_000:
                errors.append(f"missing OML 30 figure: {figure.relative_to(ROOT)}")
            if expected_src not in html:
                errors.append(f"OML 30 page does not reference {expected_src}: {page.relative_to(ROOT)}")

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
