import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const screeningUrl = "https://k4-technology.com/power-screening/";

async function read(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}
function link(html, rel, value) {
  const match = html.match(new RegExp('<link rel="' + rel + '"(?: hreflang="' + value + '")? href="([^"]+)">'));
  return match?.[1] ?? null;
}

test("Free Power Screening has a separate indexable canonical route", async () => {
  const screening = await read("power-screening/index.html");
  assert.match(screening, /<html lang="en">/);
  assert.equal(link(screening, "canonical", ""), screeningUrl);
  assert.match(screening, /name="robots" content="index,follow/);
  assert.match(screening, /id="summary-text"/);
  assert.match(screening, /@media\(max-width:639px\)\{#summary-text\{font-size:16px\}\}/);
  assert.doesNotMatch(screening, /hreflang=/);
  const sitemap = await read("sitemap.xml");
  const entry = sitemap.split("<url><loc>" + screeningUrl + "</loc>")[1]?.split("</url>")[0];
  assert.ok(entry, "screening route appears in the sitemap");
  assert.doesNotMatch(entry, /hreflang/);
});

test("preview middleware adds noindex only to Pages preview hosts", async () => {
  const source = await readFile(new URL("../functions/_middleware.js", import.meta.url), "utf8");
  const { onRequest } = await import("data:text/javascript," + encodeURIComponent(source));
  const original = new Response("ok", { headers: { "content-type": "text/plain" } });
  const preview = await onRequest({
    request: new Request("https://a1b2c3.k4-site.pages.dev/power-screening/"),
    next: async () => original
  });
  assert.equal(preview.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(original.headers.get("x-robots-tag"), null);

  const production = await onRequest({
    request: new Request(screeningUrl),
    next: async () => original
  });
  assert.equal(production, original);
  assert.equal(production.headers.get("x-robots-tag"), null);
});
