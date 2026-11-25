import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('UNVERIFIED: Playwright is not installed; responsive geometry and A4 PDF assertions were not run.');
  process.exit(0);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const auditDir = resolve(root, 'audit_screens');
mkdirSync(auditDir, { recursive: true });
const pages = [
  { lang: 'ru', path: resolve(root, 'gpu-estimate/index.html') },
  { lang: 'en', path: resolve(root, 'gpu-estimate/en-beta/index.html') }
];
const widths = [1440, 1024, 520, 500, 390];
const browser = await chromium.launch({ headless: true });
try {
  for (const pageSpec of pages) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(pageSpec.path).href);
    await page.waitForLoadState('domcontentloaded');
    const options = await page.locator('#profile option').evaluateAll(options => options.map(option => option.textContent));
    const profileLabels = options.filter(text => text && !/выберите модель|choose a model|свой профиль|custom profile|демонстрационный пример \(только кнопка\)|demo example \(button only\)/i.test(text));
    assert.ok(profileLabels.length > 0, `${pageSpec.lang}: profile options loaded`);
    assert.ok(Math.max(...profileLabels.map(text => text.length)) <= 70, `${pageSpec.lang}: profile labels <= 70 characters`);

    for (const width of widths) {
      await page.setViewportSize({ width, height: 1100 });
      for (const state of ['empty', 'demo', 'heat', 'validation']) {
        await page.locator('#clearBtn').click();
        if (state !== 'empty') await page.locator('#exampleBtn').click();
        if (state === 'heat') {
          await page.locator('#heatPower').fill('1000');
          await page.locator('#heatUse').fill('50');
          await page.locator('#heatPrice').fill('75');
        }
        if (state === 'validation') await page.locator('#units').fill('-3');
        await page.waitForTimeout(50);
        if (width < 640) {
          const smallControls = await page.locator('input:visible,select:visible,textarea:visible').evaluateAll(elements => elements.filter(el => parseFloat(getComputedStyle(el).fontSize) < 16).map(el => `${el.id || el.name || el.tagName}: ${getComputedStyle(el).fontSize}`));
          assert.deepEqual(smallControls, [], `${pageSpec.lang} ${width}px ${state}: all visible controls use >=16px`);
        }
        if (state === 'validation') assert.equal(await page.locator('#units').getAttribute('aria-invalid'), 'true', `${pageSpec.lang}: invalid units are flagged inline`);
        const overflow = await page.locator('.sheet').evaluate(sheet => {
          const viewport = document.documentElement.clientWidth;
          const failures = [];
          const excluded = el => el.closest('.table-scroll,.table-wrap,[data-horizontal-scroll]');
          const cardFor = el => el.closest('.metric,.section,.capex-block,.statusbox,.profilebar,.project-name') || sheet;
          for (const el of [sheet, ...sheet.querySelectorAll('*')]) {
            if (excluded(el) && el !== excluded(el)) continue;
            const rect = el.getBoundingClientRect();
            const cardRect = cardFor(el).getBoundingClientRect();
            if (rect.right > viewport + 1 || rect.right > cardRect.right + 1) failures.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${String(el.className?.baseVal || el.className || '').toString().trim().replace(/\s+/g,'.')}: right ${rect.right.toFixed(1)}, card ${cardRect.right.toFixed(1)}, viewport ${viewport}`);
          }
          for (const wrapper of sheet.querySelectorAll('.table-scroll,.table-wrap,[data-horizontal-scroll]')) {
            const rect=wrapper.getBoundingClientRect(), card=cardFor(wrapper).getBoundingClientRect();
            if(rect.right>viewport+1||rect.right>card.right+1)failures.push(`scroll wrapper: right ${rect.right.toFixed(1)}, card ${card.right.toFixed(1)}, viewport ${viewport}`);
          }
          return failures;
        });
        assert.deepEqual(overflow, [], `${pageSpec.lang} ${width}px ${state}: report element overflow`);
        if (width === 390 || width === 500) await page.screenshot({ path: resolve(auditDir, `regular-${pageSpec.lang}-${width}-${state}.png`), fullPage: true });
      }
    }
    await page.locator('#exampleBtn').click();
    await page.evaluate(() => {
      if (!document.querySelector('footer.k4-consent-footer')) document.body.insertAdjacentHTML('beforeend', '<footer class="k4-consent-footer"><a>Privacy settings</a><a>Privacy notice</a></footer>');
      if (!document.querySelector('#k4-consent-banner')) document.body.insertAdjacentHTML('beforeend', '<div id="k4-consent-banner">Consent banner</div>');
    });
    await page.emulateMedia({ media: 'print' });
    const hidden = await page.locator('footer.k4-consent-footer,#k4-consent-banner').evaluateAll(elements => elements.every(el => getComputedStyle(el).display === 'none'));
    assert.ok(hidden, `${pageSpec.lang}: consent elements hidden in print`);
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    const pdfText = pdf.toString('latin1');
    const pageCount = (pdfText.match(/\/Type\s*\/Page\b/g) || []).length;
    assert.equal(pageCount, 1, `${pageSpec.lang}: Demo A4 PDF has exactly one page`);
  }
  console.log('Responsive font, overflow, validation, model-label and A4 PDF browser checks passed.');
} finally {
  await browser.close();
}
