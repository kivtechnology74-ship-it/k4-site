#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const source=await readFile(new URL('../assets/calculator-analytics.js',import.meta.url),'utf8');
function boot({consent=true,ua='Mozilla/5.0'}={}){
  const eventCalls=[],gaCalls=[],timers=new Map(),inputs=new Map();let timerId=0;
  const profile={dataset:{},value:'2',addEventListener(){}};
  let contactClick;const contact={href:'/services/remote-technical-review/#review-form',hidden:true,addEventListener(type,listener){if(type==='click')contactClick=listener;}};
  const pdf={addEventListener(){}};
  const document={
    documentElement:{lang:'en'},
    querySelector(selector){return selector==='#profile'?profile:selector==='[data-calculator-contact]'?contact:selector==='#pdfBtn'?pdf:null;},
    addEventListener(){},
    getElementById(id){return inputs.get(id)||null;}
  };
  const navigations=[];const window={k4AnalyticsConsent:consent,gtag:(...args)=>gaCalls.push(args),location:{assign:url=>navigations.push(url)},setTimeout(fn){const id=++timerId;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}};
  const context={window,document,location:{pathname:'/gpu-estimate/en-beta/',href:'https://k4-technology.com/gpu-estimate/en-beta/',hostname:'k4-technology.com'},navigator:{userAgent:ua,doNotTrack:'0'},URL,URLSearchParams,crypto:webcrypto,sessionStorage:{getItem(){return null;},setItem(){}},fetch:(url,options)=>{eventCalls.push(JSON.parse(options.body));return Promise.resolve({ok:true});},CustomEvent:class{},console};
  vm.runInNewContext(source,context,{filename:'calculator-analytics.js'});
  const flush=()=>{const work=[...timers.values()];timers.clear();work.forEach(fn=>fn());};
  const setInput=(id,value)=>inputs.set(id,{value:String(value)});
  return{window,profile,contact,contactClick:()=>contactClick,eventCalls,gaCalls,navigations,flush,setInput};
}
const validProfile={id:'r5_10',brand:'Jenbacher',engine:'J320',status:'OEM confirmed'};
{
  const app=boot();app.window.K4CalculatorAnalytics.selected(validProfile);
  app.setInput('power',1000);app.window.K4CalculatorAnalytics.changed();app.window.K4CalculatorAnalytics.changed();
  app.window.K4CalculatorResult={valid:true};app.flush();
  assert.deepEqual(app.eventCalls.map(event=>event.event_name),['calculator_page_view','calculator_started','calculator_result_completed']);
  assert.equal(app.eventCalls[2].profile_type,'oem');assert.equal(app.eventCalls[2].model_id,'r5_10');
  assert.equal(app.contact.hidden,false);assert.match(app.contact.href,/calc_id=[0-9a-f-]{36}/);
  assert.equal(JSON.stringify(app.eventCalls).includes('1000'),false);
  app.window.K4CalculatorAnalytics.changed();app.window.K4CalculatorResult={valid:true};app.flush();
  assert.equal(app.eventCalls.filter(event=>event.event_name==='calculator_result_completed').length,1);
  app.window.K4CalculatorAnalytics.pdfClicked();
  assert.equal(app.eventCalls.at(-1).event_name,'calculator_pdf_clicked');
  app.setInput('power',1100);app.window.K4CalculatorAnalytics.changed();app.window.K4CalculatorResult={valid:true};app.flush();
  assert.equal(app.eventCalls.filter(event=>event.event_name==='calculator_result_completed').length,2);
}
{
  const app=boot();app.window.K4CalculatorAnalytics.selected(validProfile);
  app.window.K4CalculatorAnalytics.changed();app.window.K4CalculatorResult={valid:true};app.flush();
  const click=app.contactClick();let prevented=false;click({preventDefault(){prevented=true;}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(prevented,true);assert.equal(app.navigations.length,1);assert.match(app.navigations[0],/calc_id=/);
}
{
  const app=boot();app.window.K4CalculatorAnalytics.selected({id:'example_J320',brand:'Demo',engine:'J320',is_example:true});
  app.window.K4CalculatorAnalytics.changed();app.window.K4CalculatorResult={valid:true};app.flush();
  assert.equal(app.eventCalls.some(event=>event.event_name==='calculator_result_completed'),false);
  assert.equal(app.eventCalls[0].traffic_class,'production');
  assert.equal(app.eventCalls[1].traffic_class,'production');
  assert.equal(app.eventCalls[1].profile_type,'demo');
}
{
  const app=boot();app.window.K4CalculatorAnalytics.selected(validProfile);
  app.window.K4CalculatorAnalytics.changed();app.window.K4CalculatorResult={valid:true};app.flush();
  const first=app.eventCalls.find(event=>event.event_name==='calculator_result_completed').calc_id;
  const next={id:'r5_11',brand:'Jenbacher',engine:'J320 variant',status:'OEM confirmed'};
  app.window.K4CalculatorAnalytics.selected(next);app.window.K4CalculatorAnalytics.modelSelected(next);app.window.K4CalculatorResult={valid:true};app.flush();
  const completions=app.eventCalls.filter(event=>event.event_name==='calculator_result_completed');
  assert.equal(completions.length,2);assert.notEqual(completions[0].calc_id,completions[1].calc_id);
}
{
  const app=boot({consent:false});app.window.K4CalculatorAnalytics.selected(validProfile);
  app.window.K4CalculatorAnalytics.changed();app.window.K4CalculatorResult={valid:true};app.flush();
  assert.deepEqual(app.eventCalls,[]);assert.deepEqual(app.gaCalls,[]);
}
{
  const app=boot({ua:'SyntheticCrawler/1.0'});
  assert.equal(app.eventCalls[0].traffic_class,'probable_automation');
}
console.log('Calculator analytics client checks passed.');
