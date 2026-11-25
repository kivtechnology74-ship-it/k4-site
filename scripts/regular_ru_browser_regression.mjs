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
const golden = { outCapacity: 10630, outEnergy: 82050313, costFuelFirst: 27382875, costZipFirst: 75650388, costOpsFirst: 29209911, costOilFirst: 14112654, costTotalFirst: 146355828, ebitdaFirst: 108000141, outCapex: 452000000 };
const integerText = value => Number(String(value).replace(/[^0-9-]/g, ''));
const assertGolden = async (page, lang) => {
  for (const [id, expected] of Object.entries(golden)) {
    const actual = integerText(await page.locator(`#${id}`).innerText());
    assert.equal(actual, expected, `${lang}: demo ${id}`);
  }
  const margin = await page.locator('#marginFirst').innerText();
  assert.match(margin, /42[,.]5%/, `${lang}: demo margin 42.5%`);
  const unit = await page.locator('#outUnitCostTotal').innerText();
  assert.match(unit, /1[,.]784/, `${lang}: demo unit cost 1.784`);
};
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
        if (pageSpec.lang === 'ru' && width < 640 && state === 'empty') assert.equal(await page.locator('#mobileQuickResults').evaluate(el => el.classList.contains('hidden') && getComputedStyle(el).display === 'none'), true, `RU ${width}px: empty snapshot hidden`);
        if (pageSpec.lang === 'ru' && width < 640 && state === 'demo') {
          const snapshot = page.locator('#mobileQuickResults');
          assert.equal(await snapshot.evaluate(el => getComputedStyle(el).display !== 'none' && !el.classList.contains('hidden')), true, `RU ${width}px: demo snapshot visible`);
          assert.equal(await snapshot.locator('.mobile-kpis > div').count(), 4, `RU ${width}px: four mobile KPIs`);
          const snapshotTop = await snapshot.evaluate(el => el.getBoundingClientRect().top);
          const firstInputTop = await page.locator('#project').evaluate(el => el.getBoundingClientRect().top);
          assert.ok(snapshotTop < firstInputTop, `RU ${width}px: snapshot above first input`);
          const emptyValues = await snapshot.locator('.mobile-kpis strong').allTextContents();
          assert.ok(emptyValues.every(value => value.trim() && value.trim() !== '—' && !/NaN|undefined/i.test(value)), `RU ${width}px: snapshot has finite values`);
          await assertGolden(page, 'RU');
        }
        if (pageSpec.lang === 'ru' && width >= 640 && state === 'demo') assert.equal(await page.locator('#mobileQuickResults').evaluate(el => getComputedStyle(el).display), 'none', `RU ${width}px: snapshot hidden on desktop`);
        if (state === 'heat') {
          await page.locator('#heatPower').fill('1000');
          await page.locator('#heatUse').fill('50');
          await page.locator('#heatPrice').fill('75');
        }
        if (state === 'validation') await page.locator('#units').fill('-3');
        await page.waitForTimeout(50);
        if (width < 640) {
          const alignmentFailures = pageSpec.lang === 'ru' ? await page.locator('.panel .two,.panel .three').evaluateAll(rows => rows.flatMap((row, rowIndex) => { const fields=[...row.children].filter(field=>[...field.querySelectorAll('input,select,textarea')].some(el=>getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden')); const visualRows=new Map(); for(const field of fields){const fieldTop=Math.round(field.getBoundingClientRect().top);const control=field.querySelector('input,select,textarea');const inputTop=control.getBoundingClientRect().top;const group=visualRows.get(fieldTop)||[];group.push(inputTop);visualRows.set(fieldTop,group)} return [...visualRows.entries()].flatMap(([top,tops])=>tops.length>1&&Math.max(...tops)-Math.min(...tops)>1?[`row ${rowIndex} at ${top}: ${tops.map(value=>value.toFixed(1)).join('/')}`]:[]); })) : [];
          assert.deepEqual(alignmentFailures, [], `${pageSpec.lang} ${width}px ${state}: paired inputs aligned`);
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
    await page.setViewportSize({ width: 390, height: 1100 });
    await page.locator('#clearBtn').click();
    await page.locator('#exampleBtn').click();
    if (pageSpec.lang === 'ru') {
      await assertGolden(page, 'RU');
      const capexRows = await page.locator('#outCapexUnits,#outCapexProject,#outCapexWorks,#outCapexStart,#outCapexAux').evaluateAll(els => els.filter(el => !el.hidden).length);
      assert.equal(capexRows, 5, 'RU: all five entered CAPEX amounts are separate visible lines');
    }
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
  console.log('Responsive font, paired-field alignment, mobile snapshot, golden demo, overflow, validation, model-label, five CAPEX lines and A4 PDF browser checks passed.');
} finally {
  await browser.close();
}
