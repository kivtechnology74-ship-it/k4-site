# K4-Technology production website

This repository is the reviewable source snapshot for [k4-technology.com](https://k4-technology.com).

## Architecture

- Static HTML/CSS/JavaScript; no package manager or build step.
- English is the primary language. Russian content mirrors the main due-diligence, resources, case-study and insight routes. Chinese, Spanish and Brazilian Portuguese currently have localized landing pages; the OML 30 research also has a Chinese edition.
- Shared publication styles and navigation behavior live in `assets/intelligence.css` and `assets/intelligence.js`.
- Cloudflare may rewrite email links in the served HTML. Source files keep normal `mailto:` links.

## Local verification

Run the repository checks from the repository root:

```bash
python3 scripts/qa_release.py
python3 scripts/qa_live.py
```

`qa_release.py` validates local routes, links, titles, canonical URLs, JSON-LD and required publication files. `qa_live.py` checks the production routes and redirects without modifying production.

## Publishing safety

- Do not upload internal source documents, contracts, customer names, signatures, serial numbers or unlicensed third-party inspection photographs.
- New research and case studies should label K4 operating data, third-party evidence and K4 analysis separately.
- Update `sitemap.xml` and the relevant `llms*.txt` files when a public route is added.
- Run both QA scripts before deployment. A successful local check does not itself mean the Cloudflare deployment has completed.

The custom domain is configured by `CNAME`.
Cloudflare Git auto-deploy verified: 2026-09-20.
