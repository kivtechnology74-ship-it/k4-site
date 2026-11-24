import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import('playwright');
const url = pathToFileURL(resolve('gpu-estimate-hybrid-ru/index.html')).href;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const width of [390, 500]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(url, { waitUntil: 'load' });
    await page.locator('#gridPrice').fill('0.08');
    await page.locator('#run').click();
    await page.locator('#results').waitFor({ state: 'visible' });
    const layout = await page.locator('#results').evaluate(card => {
      const cardRight = card.getBoundingClientRect().right;
      const scrollport = card.querySelector('.table-scroll');
      const scrollRight = scrollport.getBoundingClientRect().right;
      const overflow = [...card.querySelectorAll('*')].flatMap(element => {
        const rect = element.getBoundingClientRect();
        if (!rect.width) return [];
        const inIntentionalHorizontalScroller = element.closest('.table-scroll');
        const rightLimit = inIntentionalHorizontalScroller ? scrollRight : cardRight;
        return rect.right > rightLimit + 1
          ? [{ tag: element.tagName, id: element.id, className: String(element.className), right: rect.right, rightLimit }]
          : [];
      });
      return {
        overflow,
        stickyWidth: card.querySelector('thead th:first-child').getBoundingClientRect().width,
        tableScrolls: scrollport.scrollWidth > scrollport.clientWidth,
        scrollHintVisible: getComputedStyle(card.querySelector('.table-scroll-hint')).display !== 'none'
      };
    });
    assert.deepEqual(layout.overflow, [], `visible overflow beyond results card/scroll viewport at ${width}px: ${JSON.stringify(layout.overflow)}`);
    assert.ok(layout.stickyWidth <= 140, `sticky first column is ${layout.stickyWidth}px at ${width}px`);
    assert.ok(layout.tableScrolls, `results table must remain horizontally scrollable at ${width}px`);
    assert.ok(layout.scrollHintVisible, `scroll hint must remain visible at ${width}px`);
  }
  console.log('Hybrid mobile layout regression passed at 390 and 500 px.');
} finally {
  await browser.close();
}
