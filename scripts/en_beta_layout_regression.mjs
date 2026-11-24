import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const { chromium } = await import('playwright');
const pageUrl = pathToFileURL(resolve('gpu-estimate/en-beta/index.html')).href;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const overflowAt = async (width, state) => {
  await page.setViewportSize({ width, height: 844 });
  if (state === 'demo') await page.locator('#exampleBtn').click();
  if (state === 'custom') {
    await page.locator('#profile').selectOption('custom');
    await page.locator('#customModel').fill('Custom engine model with a deliberately long name for mobile layout verification');
  }
  const result = await page.locator('.sheet').evaluate(sheet => {
    const edge = sheet.getBoundingClientRect().right;
    return [...sheet.querySelectorAll('*')].flatMap(element => {
      const rect = element.getBoundingClientRect();
      return rect.width && rect.right > edge + 1
        ? [{ tag: element.tagName, id: element.id, className: String(element.className), right: rect.right, sheetRight: edge }]
        : [];
    });
  });
  assert.deepEqual(result, [], `right-edge overflow at ${width}px in ${state}: ${JSON.stringify(result)}`);
  if (state === 'demo') await page.locator('#clearBtn').click();
  if (state === 'custom') await page.locator('#clearBtn').click();
};

try {
  for (const width of [390, 500]) {
    await page.goto(pageUrl, { waitUntil: 'load' });
    for (const state of ['empty', 'demo', 'custom']) {
      await overflowAt(width, state);
      if (state !== 'custom') await page.locator('#clearBtn').click();
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(pageUrl, { waitUntil: 'load' });
  await page.locator('#exampleBtn').click();
  await page.evaluate(() => {
    const footer = document.createElement('footer');
    footer.className = 'k4-consent-footer';
    footer.textContent = 'Privacy settings Privacy notice';
    document.body.append(footer);
    const banner = document.createElement('section');
    banner.id = 'k4-consent-banner';
    banner.textContent = 'Privacy consent banner';
    document.body.append(banner);
  });
  const dir = await mkdtemp(resolve(tmpdir(), 'k4-en-beta-pdf-'));
  const pdfPath = resolve(dir, 'demo-a4.pdf');
  try {
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
    const info = spawnSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
    assert.equal(info.status, 0, `pdfinfo failed: ${info.stderr}`);
    const pages = Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
    assert.equal(pages, 1, `expected one A4 page, got ${pages}`);
    const text = spawnSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' });
    assert.equal(text.status, 0, `pdftotext failed: ${text.stderr}`);
    for (const expected of ['INTERNATIONAL', 'RUB 108,000,141', 'RUB 452,000,000']) assert.ok(text.stdout.includes(expected), `PDF must contain ${expected}`);
    for (const forbidden of ['Privacy', 'Russia']) assert.ok(!text.stdout.includes(forbidden), `PDF must not contain ${forbidden}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  console.log('Layout regression passed: 6 mobile geometry states and one-page A4 PDF.');
} finally {
  await browser.close();
}
