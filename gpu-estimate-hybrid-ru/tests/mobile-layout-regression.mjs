import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import('playwright');
const url = pathToFileURL(resolve('gpu-estimate-hybrid-ru/index.html')).href;
const browser = await chromium.launch({ headless: true });
const normalize = text => text.replace(/[\s\u00a0\u202f]/g, '');
const viewports = [1440, 1024, 520, 500, 390];

async function checkFormFonts(page, width, state) {
  const controls = await page.locator('input,select,textarea').evaluateAll(elements => elements
    .filter(element => {
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    })
    .map(element => ({ id: element.id || element.name || element.tagName, fontSize: parseFloat(getComputedStyle(element).fontSize) })));
  if (width < 640) {
    const small = controls.filter(control => control.fontSize < 16);
    assert.deepEqual(small, [], `visible controls below 16px at ${width}px (${state}): ${JSON.stringify(small)}`);
  }
  return controls;
}

async function checkCardEdges(page, width, state) {
  const violations = await page.evaluate(() => {
    const viewportRight = window.innerWidth;
    return [...document.querySelectorAll('.card')].flatMap(card => {
      if (!card.getClientRects().length || getComputedStyle(card).display === 'none') return [];
      const cardRight = card.getBoundingClientRect().right;
      const elements = [card, ...card.querySelectorAll('*')];
      return elements.flatMap(element => {
        if (!element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') return [];
        const rect = element.getBoundingClientRect();
        if (!rect.width) return [];
        const scrollWrapper = element.closest('.table-scroll');
        if (scrollWrapper && element !== scrollWrapper) return [];
        const limits = [
          { edge: 'viewport', right: viewportRight },
          { edge: 'card', right: cardRight }
        ];
        return limits.filter(limit => rect.right > limit.right + 1).map(limit => ({
          card: card.id || card.querySelector('h1,h2')?.textContent?.trim() || 'card',
          element: element.tagName.toLowerCase(),
          id: element.id || '',
          className: typeof element.className === 'string' ? element.className : '',
          actualRight: rect.right,
          allowedRight: limit.right + 1,
          boundary: limit.edge
        }));
      });
    });
  });
  assert.deepEqual(violations, [], `card edge overflow at ${width}px (${state}): ${JSON.stringify(violations)}`);
  return violations;
}

async function run(page) {
  await page.locator('#loadKW').fill('1000');
  await page.locator('#loadFactor').fill('70');
  await page.locator('#power').fill('1000');
  await page.locator('#units').fill('2');
  await page.locator('#rate').fill('250');
  await page.locator('#fuelUnit').fill('Нм³');
  await page.locator('#fuelPrice').fill('0.10');
  await page.locator('#gridPrice').fill('0.08');
  await page.locator('#bessPower').fill('500');
  await page.locator('#bessEnergy').fill('1000');
  await page.locator('#rte').fill('88');
  await page.locator('#soc0').fill('50');
  await page.locator('#reserve').fill('10');
  await page.locator('#run').click();
  await page.locator('#results').waitFor({ state: 'visible' });
}

async function checkGolden(page) {
  const row = async name => page.locator('#rows tr').filter({ hasText: name }).first();
  const cells = async name => row(name).locator('td');
  const grid = await cells('Только сеть');
  assert.equal(normalize(await grid.nth(1).innerText()), '6132,0', 'grid-only energy MWh');
  assert.equal(normalize(await grid.nth(12).locator('.cost-primary').innerText()), 'USD490560', 'grid-only cost');
  const gas = await cells('Только ГПУ');
  assert.equal(normalize(await gas.nth(2).innerText()), '6132,0', 'gas-only energy MWh');
  assert.equal(normalize(await gas.nth(7).innerText()), '1533000Нм³', 'gas-only fuel');
  assert.equal(normalize(await gas.nth(12).locator('.cost-primary').innerText()), 'USD153300', 'gas-only cost');
  const bess = await cells('ГПУ + BESS');
  assert.equal(normalize(await bess.nth(2).innerText()), '6394,9', 'gas + BESS generation MWh');
  assert.equal(normalize(await bess.nth(5).innerText()), '2190,0', 'BESS charge MWh');
  assert.equal(normalize(await bess.nth(6).innerText()), '1927,1', 'BESS discharge MWh');
  assert.equal(normalize(await bess.nth(7).innerText()), '1598716Нм³', 'gas + BESS fuel');
  assert.equal(normalize(await bess.nth(10).innerText()), '569,0/56,9%', 'ending SOC');
  assert.equal(normalize(await bess.nth(12).locator('.cost-primary').innerText()), 'USD159872', 'gas + BESS cost');
  const adjusted = normalize(await bess.nth(12).locator('.cost-adjusted').innerText());
  assert.match(adjusted, /SOC-корр\.:USD159870/);
  assert.match(adjusted, /USD2/);
}

async function checkTexasKpi(page, width) {
  if (width >= 640) return null;
  const measured = await page.locator('#summary').evaluate(summary => {
    const tile = summary.lastElementChild;
    const bounds = element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, width: rect.width };
    };
    return {
      summary: bounds(summary),
      tile: bounds(tile),
      gridColumn: getComputedStyle(tile).gridColumn,
      tileCount: summary.children.length
    };
  });
  assert.equal(measured.tileCount, 5, `expected five result KPI tiles at ${width}px`);
  assert.ok(measured.tile.width >= measured.summary.width - 2, `Texas KPI must span the row at ${width}px: ${JSON.stringify(measured)}`);
  assert.ok(measured.tile.left <= measured.summary.left + 1, `Texas KPI must start at row left at ${width}px`);
  return measured;
}

try {
  await mkdir(resolve('audit_screens'), { recursive: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const width of viewports) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(url, { waitUntil: 'load' });
    const emptyFonts = await checkFormFonts(page, width, 'empty');
    await checkCardEdges(page, width, 'empty');

    await run(page);
    const goldenFonts = await checkFormFonts(page, width, 'golden');
    await checkGolden(page);
    await checkCardEdges(page, width, 'golden');
    const texasKpi = await checkTexasKpi(page, width);
    if (width === 390 || width === 500 || width === 520 || width === 1440 || width === 1024) {
      await page.screenshot({ path: resolve(`audit_screens/hybrid-ios-${width}-golden.png`), fullPage: true });
    }

    await page.locator('#bessEnergy').fill('20000');
    await page.locator('#soc0').fill('90');
    await page.locator('#run').click();
    const thresholdCell = page.locator('#rows tr').filter({ hasText: 'ГПУ + BESS' }).first().locator('td').nth(12);
    const primary = normalize(await thresholdCell.locator('.cost-primary').innerText());
    const adjusted = normalize(await thresholdCell.locator('.cost-adjusted').innerText());
    assert.equal(primary, 'Несопоставимо', `20 MWh cost comparability at ${width}px`);
    assert.match(adjusted, /SOC-корр\.:USD159872/);
    assert.match(adjusted, /USD388/);
    await checkFormFonts(page, width, 'SOC-threshold');
    await checkCardEdges(page, width, 'SOC-threshold');

    await page.reload({ waitUntil: 'load' });
    await page.locator('#units').fill('-3');
    await page.locator('#loadFactor').fill('150');
    await page.locator('#run').click();
    await page.locator('#errorSummary').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#units').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('#loadFactor').getAttribute('aria-invalid'), 'true');
    await checkFormFonts(page, width, 'validation');
    await checkCardEdges(page, width, 'validation');

    console.log(JSON.stringify({ width, emptyVisibleControlFonts: emptyFonts, goldenVisibleControlFonts: goldenFonts, texasKpi, states: ['empty', 'golden', 'SOC-threshold', 'validation'], overflow: 'none' }));
  }
  console.log('Hybrid iOS UI regression passed at 1440, 1024, 520, 500 and 390 px.');
} finally {
  await browser.close();
}
