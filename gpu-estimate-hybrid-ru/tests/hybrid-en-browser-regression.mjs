import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.log('UNVERIFIED: Playwright is unavailable; install with npx playwright install chromium and rerun.'); process.exit(0); }

const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const base=resolve(root,'.'+pathname);
    if(base!==root&&!base.startsWith(root+sep)){res.writeHead(403).end();return;}
    const target=pathname.endsWith('/')?resolve(base,'index.html'):base;
    const body=await readFile(target);
    res.writeHead(200,{'content-type':mime[extname(target)]||'application/octet-stream'}).end(body);
  } catch { res.writeHead(404).end('Not found'); }
});
await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
const port=server.address().port;
const browser=await chromium.launch({headless:true});
const cyrillic=/[\u0400-\u04FF]/;
const checkEnglishDom=async(page,label)=>{
  const issues=await page.evaluate(()=>{
    const bad=[];
    const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
    for(const el of document.querySelectorAll('body *')){
      if(!visible(el))continue;
      if(/[\u0400-\u04FF]/.test(el.innerText||''))bad.push(`${el.tagName}#${el.id}: visible text`);
      for(const name of ['title','aria-label','placeholder','alt'])if(/[\u0400-\u04FF]/.test(el.getAttribute(name)||''))bad.push(`${el.tagName}#${el.id}: ${name}`);
      if(el.matches('select'))for(const option of el.options)if(/[\u0400-\u04FF]/.test(option.textContent||''))bad.push(`${el.id}: option text`);
    }
    return bad;
  });
  assert.deepEqual(issues,[],`${label}: rendered content and attributes contain no Cyrillic`);
};
const fillGolden=async(page,{energy='1000',soc='50'}={})=>{
  for(const [id,value] of Object.entries({loadKW:'1000',loadFactor:'70',power:'1000',units:'2',rate:'250',fuelUnit:'Nm³',fuelPrice:'0.10',bessPower:'500',bessEnergy:energy,soc0:soc,reserve:'10',rte:'88',gridPrice:'0.08'}))await page.locator(`#${id}`).fill(value);
  await page.locator('#currency').selectOption('USD');
  await page.locator('#run').click();
  await page.waitForFunction(()=>!document.querySelector('#results').classList.contains('hidden'));
};
const checkFont=async(page,width,state)=>{
  if(width>=640)return;
  const sizes=await page.locator('input:visible,select:visible,textarea:visible').evaluateAll(els=>els.map(el=>({id:el.id,size:parseFloat(getComputedStyle(el).fontSize)})));
  assert.ok(sizes.length>0,`EN ${width}px ${state}: visible controls found`);
  assert.deepEqual(sizes.filter(item=>item.size<16),[],`EN ${width}px ${state}: all visible controls are at least 16px`);
};
const checkOverflow=async(page,width,state)=>{
  const failures=await page.locator('.card').evaluateAll(cards=>{
    const failed=[];
    for(const card of cards){
      const cardRect=card.getBoundingClientRect();
      const elements=[card,...card.querySelectorAll('*')];
      for(const el of elements){
        const wrapper=el.closest('.table-scroll');
        if(wrapper&&el!==wrapper)continue;
        const style=getComputedStyle(el),rect=el.getBoundingClientRect();
        if(style.display==='none'||style.visibility==='hidden'||rect.width===0||rect.height===0)continue;
        if(rect.right>innerWidth+1||rect.right>cardRect.right+1)failed.push(`${el.tagName.toLowerCase()}#${el.id||''}.${String(el.className?.baseVal||el.className||'').toString().trim().replace(/\s+/g,'.')} right=${rect.right.toFixed(1)} card=${cardRect.right.toFixed(1)} viewport=${innerWidth}`);
      }
    }
    return failed;
  });
  assert.deepEqual(failures,[],`EN ${width}px ${state}: no card overflow`);
};
try {
  for(const width of [390,500,1024,1440]){
    const page=await browser.newPage({viewport:{width,height:1000},deviceScaleFactor:1});
    await page.goto(`http://127.0.0.1:${port}/gpu-estimate-hybrid-en/`);
    await page.waitForFunction(()=>window.K4Hybrid);
    await checkEnglishDom(page,`${width}px initial`);
    // Empty form: results remain hidden and no zero/NaN result rows are created.
    await page.locator('#reset').click();
    assert.equal(await page.locator('#results').evaluate(el=>el.classList.contains('hidden')),true,`EN ${width}px empty: results hidden`);
    await checkFont(page,width,'empty'); await checkOverflow(page,width,'empty'); await checkEnglishDom(page,`${width}px empty`);

    await fillGolden(page);
    const rows=await page.locator('#rows tr').evaluateAll(trs=>trs.map(tr=>[...tr.cells].map(cell=>cell.innerText.trim())));
    assert.equal(rows.length,5,`EN ${width}px golden: five scenarios`);
    assert.equal(rows[0][1],'6,132.0'); assert.equal(rows[0][12],'USD 490,560\nSOC-adj.: USD 490,560 (+USD 0)');
    assert.equal(rows[1][2],'6,132.0'); assert.equal(rows[1][7],'1,533,000 Nm³'); assert.equal(rows[1][12],'USD 153,300\nSOC-adj.: USD 153,300 (+USD 0)');
    assert.equal(rows[2][2],'6,394.9'); assert.equal(rows[2][5],'2,190.0'); assert.equal(rows[2][6],'1,927.1'); assert.equal(rows[2][7],'1,598,716 Nm³');
    assert.match(rows[2][9],/^500\.0 \/ 50\.0%$/); assert.match(rows[2][10],/^569\.0 \/ 56\.9%$/); assert.equal(rows[2][12],'USD 159,872\nSOC-adj.: USD 159,870 (-USD 2)');
    assert.deepEqual(rows[3].slice(1),rows[2].slice(1),'PV=0 row matches Gas+BESS numeric outputs');
    assert.deepEqual(rows[4].slice(1),rows[2].slice(1),'PV=0 grid+gas row matches Gas+BESS numeric outputs');
    if(width<640){
      const tile=await page.locator('#summary .metric:last-child').evaluate(el=>{const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect(),s=getComputedStyle(el);return{left:r.left,parentLeft:p.left,width:r.width,parentWidth:p.width,columnStart:s.gridColumnStart,columnEnd:s.gridColumnEnd}});
      assert.equal(tile.columnStart,'1',`EN ${width}px: 5th summary tile starts at full row`); assert.equal(tile.columnEnd,'-1',`EN ${width}px: 5th summary tile spans full row`); assert.ok(Math.abs(tile.width-tile.parentWidth)<2,`EN ${width}px: 5th summary tile width matches the full row`);
    }
    await checkFont(page,width,'golden'); await checkOverflow(page,width,'golden'); await checkEnglishDom(page,`${width}px golden`);

    await page.locator('#bessEnergy').fill('20000'); await page.locator('#soc0').fill('90'); await page.locator('#run').click();
    const threshold=await page.locator('#rows tr:nth-child(3) td.cost-cell').innerText();
    assert.equal(threshold,'Not comparable\nSOC-adj.: USD 159,872 (+USD 388)',`EN ${width}px: 20 MWh SOC 90% output`);
    await checkFont(page,width,'20MWh'); await checkOverflow(page,width,'20MWh'); await checkEnglishDom(page,`${width}px 20MWh`);

    await page.locator('#units').fill('-3'); await page.locator('#loadFactor').fill('150'); await page.locator('#run').click();
    assert.equal(await page.locator('#units').getAttribute('aria-invalid'),'true',`EN ${width}px: units validation`);
    assert.equal(await page.locator('#loadFactor').getAttribute('aria-invalid'),'true',`EN ${width}px: load factor validation`);
    assert.equal(await page.locator('#results').evaluate(el=>el.classList.contains('hidden')),true,`EN ${width}px validation: results hidden`);
    await checkFont(page,width,'validation'); await checkOverflow(page,width,'validation'); await checkEnglishDom(page,`${width}px validation`);
    await page.close();
  }
  console.log('Hybrid EN browser regression passed at 390, 500, 1024 and 1440 px: font sizes, five-row golden results, 20 MWh threshold, validation, card overflow, English-only rendered text and full-width fifth summary tile verified.');
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolveClose=>server.close(resolveClose)); }
