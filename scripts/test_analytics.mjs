#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {buildCampaignUrl,validateCampaign,validateCampaignUrl} from './campaign_urls.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=await readFile(resolve(ROOT,'assets/intelligence.js'),'utf8');

const boot=(href,storedInternal=false,{elements=[],form=null}={})=>{
  const pageUrl=new URL(href);
  const storage=new Map(storedInternal?[['k4_internal','true']]:[]);
  const replaced=[];
  const window={
    dataLayer:[],
    addEventListener(){},
    dispatchEvent(){},
    setTimeout(){},
    scrollY:0,
    innerHeight:800
  };
  const document={
    cookie:storedInternal?'k4_internal=1':'',
    documentElement:{lang:'en',scrollHeight:1000},
    body:{scrollHeight:1000},
    head:{appendChild(){}},
    querySelector(selector){
      if(selector.startsWith('script['))return {};
      if(selector==='[data-lead-form]')return form;
      return null;
    },
    querySelectorAll(selector){return selector==='a[href], [data-event]'?elements:[];},
    createElement(){return {dataset:{}};},
    addEventListener(){}
  };
  const location={
    href:pageUrl.href,
    search:pageUrl.search,
    pathname:pageUrl.pathname,
    origin:pageUrl.origin
  };
  const history={state:null,replaceState(_state,_title,next){replaced.push(next);}};
  const context={
    window,document,location,history,URL,URLSearchParams,Date,Math,Set,Map,Object,Array,String,
    localStorage:{
      getItem:key=>storage.get(key)||null,
      setItem:(key,value)=>storage.set(key,value),
      removeItem:key=>storage.delete(key)
    },
    requestAnimationFrame(){},
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
    FormData:class{entries(){return [];}}
  };
  window.window=window;
  vm.runInNewContext(source,context,{filename:'assets/intelligence.js'});
  const config=window.dataLayer.find(args=>args[0]==='config');
  return {config:config?.[2],replaced,storage,dataLayer:window.dataLayer};
};

const fakeLink=({href,event,channel='internal_navigation'})=>{
  const listeners={};
  return {
    dataset:{event,channel,location:'test-cta',language:'en'},
    listeners,
    addEventListener(type,listener){listeners[type]=listener;},
    getAttribute(name){return name==='href'?href:null;},
    hasAttribute(){return false;},
    closest(){return null;}
  };
};

{
  const result=boot('https://k4-technology.com/?k4_internal=1');
  assert.equal(result.config.traffic_type,'internal');
  assert.equal(result.config.debug_mode,undefined);
  assert.deepEqual(result.replaced,['/']);
}
{
  const result=boot('https://k4-technology.com/?k4_internal=0',true);
  assert.equal(result.config.traffic_type,undefined);
  assert.equal(result.config.debug_mode,undefined);
  assert.equal(result.storage.has('k4_internal'),false);
  assert.deepEqual(result.replaced,['/']);
}
{
  const href='https://k4-technology.com/?utm_source=codex_internal_test&utm_medium=qa&utm_campaign=analytics_validation&utm_content=desktop_en';
  const result=boot(href);
  assert.equal(result.config.traffic_type,'internal');
  assert.equal(result.config.debug_mode,true);
  assert.equal(result.config.page_location,href);
  assert.deepEqual(result.replaced,[]);
}
{
  const href='https://k4-technology.com/?utm_source=direct_outreach&utm_medium=email&utm_campaign=existing_fleet_2026&utm_content=apa_group_01&qa=release_check&release=abc123';
  const result=boot(href);
  const visible=new URL(result.replaced[0],new URL(href).origin);
  assert.equal(visible.searchParams.get('utm_campaign'),'existing_fleet_2026');
  assert.equal(visible.searchParams.has('qa'),false);
  assert.equal(visible.searchParams.has('release'),false);
  assert.equal(result.config.page_location,visible.href);
}
{
  const href='https://k4-technology.com/case-studies/j320-303-days-operating-data/?amp;utm_medium=email&amp;utm_campaign=existing_fleet_2026&amp;utm_content=apa_group_01';
  const result=boot(href);
  const repaired=new URL(result.config.page_location);
  assert.equal(repaired.searchParams.get('utm_source'),'direct_outreach');
  assert.equal(repaired.searchParams.get('utm_medium'),'email');
  assert.equal(repaired.searchParams.get('utm_campaign'),'existing_fleet_2026');
  assert.equal(repaired.searchParams.get('utm_content'),'apa_group_01');
  assert.equal([...repaired.searchParams.keys()].some(key=>key.startsWith('amp;utm_')),false);
  assert.equal(result.replaced.length,1);
}

const definitions=JSON.parse(await readFile(resolve(ROOT,'campaigns/campaign_urls.json'),'utf8'));
for(const campaign of definitions){
  const result=validateCampaign(campaign);
  assert.deepEqual(result.errors,[],`${result.name}: ${result.errors.join(', ')}`);
  const parsed=new URL(result.url);
  for(const key of ['utm_source','utm_medium','utm_campaign','utm_content']){
    assert.equal(parsed.searchParams.get(key),campaign[key]);
  }
}
assert.ok(validateCampaignUrl('https://k4-technology.com/?amp;utm_medium=email&utm_campaign=x&utm_content=y').length>0);
assert.ok(validateCampaignUrl('https://k4-technology.com/?utm_medium=email&utm_campaign=x&utm_content=y').some(error=>error==='missing utm_source'));

{
  const link=fakeLink({href:'mailto:ceo@k4-technology.com',event:'ai_power_cta_click',channel:'email'});
  const result=boot('https://k4-technology.com/services/ai-power-project-advisory/',false,{elements:[link]});
  link.listeners.click();
  const events=result.dataLayer.filter(args=>args[0]==='event').map(args=>args[1]);
  assert.deepEqual(events,['ai_power_cta_click','lead_contact_click']);
}
{
  const link=fakeLink({href:'mailto:ceo@k4-technology.com',event:'lead_contact_click',channel:'email'});
  const result=boot('https://k4-technology.com/',false,{elements:[link]});
  link.listeners.click();
  const events=result.dataLayer.filter(args=>args[0]==='event').map(args=>args[1]);
  assert.deepEqual(events,['lead_contact_click']);
}
{
  const listeners={};
  const form={
    dataset:{location:'remote-review-form'},
    addEventListener(type,listener){listeners[type]=listener;},
    querySelector(){return null;}
  };
  const result=boot('https://k4-technology.com/services/remote-technical-review/',false,{form});
  listeners.input();
  listeners.input();
  listeners.submit({preventDefault(){}});
  const events=result.dataLayer.filter(args=>args[0]==='event').map(args=>args[1]);
  assert.deepEqual(events,['lead_form_start','lead_form_mailto_open']);
}

assert.equal(source.includes("track('equipment_form_submit'"),false);
assert.equal(source.includes("track('lead_form_submit_success'"),false);
assert.equal(source.includes("track('generate_lead'"),false);
assert.match(source,/track\('lead_form_mailto_open'/);
assert.match(source,/const trackedThisGesture=new Set\(\)/);

console.log('Analytics contract tests passed.');
