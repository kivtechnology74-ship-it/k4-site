import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const live=process.argv[2], origin=live || 'https://calc.getworkhorseweb.com';
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||undefined,headless:true});
const read=file=>readFileSync(new URL('../dist/'+file,import.meta.url),'utf8');
try {
  const page=await browser.newPage();
  const events=[],statuses=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(new URL(r.url()).pathname==='/api/calculator-event') events.push(r.postDataJSON());});
  page.on('response',r=>{if(new URL(r.url()).pathname==='/api/calculator-event') statuses.push(r.status());});
  await page.addInitScript(()=>{window.print=()=>{window.printRequested=true;};});
  if (!live) {
    const csp=read('_headers').split('Content-Security-Policy: ')[1].trim();
    await page.route(origin+'/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      if (path==='/api/calculator-event') return route.fulfill({status:204});
      if (path==='/') return route.fulfill({body:read('index.html'),contentType:'text/html; charset=utf-8',headers:{'content-security-policy':csp}});
      if (path==='/calculator-events.js') return route.fulfill({body:read('calculator-events.js'),contentType:'application/javascript'});
      return route.abort();
    });
  }
  const seen=async n=>{await page.waitForFunction(n=>JSON.parse(sessionStorage.getItem('calculator-session-v1')).pending.length===0,n,{timeout:15000});assert.equal(events.length,n);};
  await page.goto(origin+'/#watch-test');
  await seen(1);
  await page.locator('#exampleBtn').click();
  await page.locator('#clearBtn').click();
  await page.locator('#profile').selectOption({label:await page.locator('#profile option').evaluateAll(opts=>opts.find(o=>o.textContent.includes('J320')&&!o.hidden).textContent)});
  await page.locator('#fuelPrice').fill('0.1');
  await page.locator('#electricPrice').fill('3');
  await page.locator('#zipCost').fill('0.25');
  await page.locator('#opsCost').fill('0.25');
  await page.locator('#oilCost').fill('0.25');
  await page.locator('#oilCost').press('Tab');
  await seen(3);
  assert.deepEqual(events.map(x=>x.ordinal),[0,1,2]);
  const initial=await page.locator('#outEnergy').textContent();
  assert.equal(initial.replace(/\D/g,''),'8536000');
  assert.ok(await page.evaluate(()=>window.CalculatorResult.valid));
  await page.locator('#units').fill('0');
  await page.locator('#units').press('Tab');
  assert.ok(!await page.evaluate(()=>window.CalculatorResult.valid));
  await page.locator('#units').fill('2');
  await page.locator('#units').press('Tab');
  await seen(4);
  await page.locator('#project').fill('QA PRIVATE VALUE');
  await page.locator('#pdfBtn').click();
  await page.locator('#pdfBtn').click();
  await seen(5);
  assert.ok(await page.evaluate(()=>window.printRequested));
  assert.equal((await page.locator('#outEnergy').textContent()).replace(/\D/g,''),'17072000');
  assert.deepEqual(events.map(x=>x.ordinal),[0,1,2,3,40]);
  for(const e of events) {
    assert.equal(e.test,true);
    assert.deepEqual(Object.keys(e).sort(),(e.ordinal===2||e.ordinal===3?['sid','test','ordinal','power','unit','gas']:['sid','test','ordinal']).sort());
    if(e.unit) assert.deepEqual([e.unit,e.gas,e.power],['RUB/kWh_th','<1','1–5']);
  }
  const id=events[0].sid;
  assert.ok(events.every(e=>e.sid===id));
  await page.reload();
  await seen(5);
  assert.deepEqual(statuses,[204,204,204,204,204]);
  if(!live) {
    await page.route('**/api/calculator-event',route=>route.fulfill({status:503}));
    await page.locator('#exampleBtn').click();
    await page.locator('#profile').selectOption({label:await page.locator('#profile option').evaluateAll(opts=>opts.find(o=>o.textContent.includes('J320')&&!o.hidden).textContent)});
    await page.locator('#fuelPrice').fill('0.2');
    await page.locator('#fuelPrice').press('Tab');
    assert.ok(await page.evaluate(()=>window.CalculatorResult.valid));
    await page.locator('#pdfBtn').click();
    assert.ok(await page.evaluate(()=>window.printRequested));
    await page.waitForResponse(r=>r.status()===503,{timeout:4000}).catch(()=>{});
    assert.ok(statuses.includes(503));
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({origin,test_session:id,ordinals:[0,1,2,3,40],http:statuses,page_errors:errors}));
} finally {await browser.close();}
