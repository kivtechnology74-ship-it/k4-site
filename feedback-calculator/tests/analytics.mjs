import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import worker from '../dist/_worker.js';

const read = file => readFileSync(new URL(file,import.meta.url),'utf8');
const production = 'https://calc.getworkhorseweb.com';
const schema = read('../analytics/schema.sql');
const sid = crypto.randomUUID();
const facts = {power:'1–5',unit:'RUB/Nm3',gas:'5–10'};
export function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  const env = {CALC_DB:{prepare(sql) {
    const stmt=db.prepare(sql);
    return {bind:(...args)=>({run:()=>({meta:stmt.run(...args)}),first:()=>stmt.get(...args)})};
  }}};
  return {db,env};
}
function send(env,event,options={}) {
  const site = options.site || production;
  return worker.fetch(new Request(site+'/api/calculator-event',{
    method:'POST',headers:{origin:site,'content-type':'application/json',...options.headers},
    body:options.raw ?? JSON.stringify(event)
  }),env).then(r=>r.status);
}
const row = (ordinal,options={}) => ({sid,test:false,ordinal,...options});
test('schema, sequential funnel, atomic deduplication, explicit test and alias isolation',async()=>{
  const {db,env}=database();
  assert.equal(await send(env,row(2,facts)),429);
  for (const event of [row(0),row(1),row(2,facts),row(3,facts),row(40)]) {
    assert.deepEqual(await Promise.all([send(env,event),send(env,event)]),[204,204]);
  }
  assert.equal(await send(env,row(0,{test:true})),204);
  assert.equal(await send(env,{...row(0),sid:crypto.randomUUID()},{site:'https://qa.gpu-economics-feedback-ru.pages.dev'}),204);
  assert.equal(db.prepare('select count(*) n from calculator_events where is_test=0').get().n,5);
  assert.equal(db.prepare('select count(*) n from calculator_events where is_test=1').get().n,2);
});
test('allowlists, bounds on streamed and declared bytes, origin, method, storage outage',async()=>{
  const {env}=database();
  for (const headers of [{origin:'https://other.example'},{'sec-fetch-site':'cross-site'}])
    assert.equal(await send(env,row(0),{headers}),403);
  assert.equal(await send(env,row(0),{headers:{'content-type':'text/plain'}}),415);
  assert.equal(await send(env,row(0),{raw:'x'.repeat(385)}),413);
  assert.equal(await send(env,row(0),{headers:{'content-length':'5000'}}),413);
  assert.equal((await worker.fetch(new Request(production+'/api/calculator-event'),env)).status,405);
  for (const raw of [null,[],{},row(0,{contact:'test'}),row(3,{...facts,gas:1.234}),row(2,{...facts,unit:'free text'}),row(0,{sid:'abcd'}),row(34),row(0,{test:1}),row(2,{...facts,unit:'unknown'})])
    assert.equal(await send(env,raw),400);
  assert.equal(await send({},row(0)),503);
});
test('quotas, duplicate at capacity, bounded active retention and indexed hour report',async()=>{
  const {env,db}=database();
  const hour=Math.floor(Date.now()/3600000);
  db.prepare('insert into calculator_events values (?,?,0,?,1,null,null,null)').run(crypto.randomUUID(),0,hour-721);
  for (let i=0;i<360;i++) assert.equal(await send(env,{...row(0),sid:i ? crypto.randomUUID():sid}),204);
  assert.equal(await send(env,row(0)),204);
  assert.equal(await send(env,{...row(0),sid:crypto.randomUUID()}),429);
  assert.equal(db.prepare('select count(*) n from calculator_events where hour_utc<?').get(hour).n,0);
  const hourly=read('../analytics/watch-hour.sql'), ranges=read('../analytics/watch-ranges.sql');
  assert.equal(db.prepare(hourly).get().opens,0);
  db.prepare('UPDATE calculator_events SET hour_utc=hour_utc-1').run();
  db.exec('DELETE FROM calculator_events WHERE slot>1');
  for (let i=1;i<=3;i++) assert.equal(await send(env,i===1?row(i):row(i,facts)),204);
  assert.equal(db.prepare(hourly).get().open_to_calculation_pct,0);
  db.prepare('UPDATE calculator_events SET hour_utc=hour_utc-1,slot=slot+1 WHERE hour_utc=?').run(hour);
  await send(env,row(0,{test:true}));
  db.exec('UPDATE calculator_events SET hour_utc=hour_utc-1 WHERE is_test=1');
  const report=db.prepare(hourly).get();
  assert.deepEqual([report.opens,report.starts,report.first_calculations,report.recalculations,report.open_to_calculation_pct],[1,1,1,1,100]);
  assert.equal(db.prepare(ranges).get().calculations,2);
  for (let ordinal=4;ordinal<=33;ordinal++) assert.equal(await send(env,row(ordinal,facts)),204);
  assert.equal(await send(env,row(34,facts)),400);
});
