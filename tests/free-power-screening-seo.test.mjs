import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const enUrl = "https://k4-technology.com/gpu-estimate-hybrid-en/";
const ruUrl = "https://k4-technology.com/gpu-estimate-hybrid-ru/";

async function read(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}
function link(html, rel, value) {
  const match = html.match(new RegExp('<link rel="' + rel + '"(?: hreflang="' + value + '")? href="([^"]+)">'));
  return match?.[1] ?? null;
}

test("EN/RU production routes use canonical URLs and reciprocal hreflang", async () => {
  const en = await read("gpu-estimate-hybrid-en/index.html");
  const ru = await read("gpu-estimate-hybrid-ru/index.html");
  assert.match(en, /<html lang="en">/);
  assert.match(ru, /<html lang="ru">/);
  assert.equal(link(en, "canonical", ""), enUrl);
  assert.equal(link(ru, "canonical", ""), ruUrl);
  for (const html of [en, ru]) {
    assert.match(html, /name="robots" content="index,follow/);
    assert.doesNotMatch(html, /name="robots" content="noindex/);
    assert.match(html, new RegExp('hreflang="en" href="' + enUrl.replaceAll("/", "\\/") + '"'));
    assert.match(html, new RegExp('hreflang="ru" href="' + ruUrl.replaceAll("/", "\\/") + '"'));
    assert.match(html, new RegExp('hreflang="x-default" href="' + enUrl.replaceAll("/", "\\/") + '"'));
    assert.match(html, /href="https:\/\/k4-technology\.com\/services\/ai-power-project-advisory\//);
  }
  const sitemap = await read("sitemap.xml");
  assert.match(sitemap, new RegExp("<loc>" + enUrl.replaceAll("/", "\\/") + "<\\/loc>"));
  assert.match(sitemap, new RegExp("<loc>" + ruUrl.replaceAll("/", "\\/") + "<\\/loc>"));
  assert.match(sitemap, new RegExp('hreflang="en" href="' + enUrl.replaceAll("/", "\\/") + '"'));
  assert.match(sitemap, new RegExp('hreflang="ru" href="' + ruUrl.replaceAll("/", "\\/") + '"'));
});

test("preview middleware adds noindex only to Pages preview hosts", async () => {
  const source = await readFile(new URL("../functions/_middleware.js", import.meta.url), "utf8");
  const { onRequest } = await import("data:text/javascript," + encodeURIComponent(source));
  const original = new Response("ok", { headers: { "content-type": "text/plain" } });
  const preview = await onRequest({
    request: new Request("https://a1b2c3.k4-site.pages.dev/gpu-estimate-hybrid-en/"),
    next: async () => original
  });
  assert.equal(preview.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(original.headers.get("x-robots-tag"), null);

  const production = await onRequest({
    request: new Request(enUrl),
    next: async () => original
  });
  assert.equal(production, original);
  assert.equal(production.headers.get("x-robots-tag"), null);
});
