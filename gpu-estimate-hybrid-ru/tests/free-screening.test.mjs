import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require=createRequire(import.meta.url);
const here=dirname(fileURLToPath(import.meta.url));
const {calculateScreening}=require(resolve(here,'../screening-engine.js'));
const {shouldTrackInquirySubmitted,safeAnalyticsPayload}=require(resolve(here,'../screening-ui.js'));
const base=overrides=>({requiredPowerMW:'10',loadType:'it',pue:'1.3',utilizationPercent:'70',gridTariff:'0.10',currency:'USD',gridCapacityMW:'12',connectionDate:'',...overrides});

test('IT Load uses user PUE for nominal grid check and annual energy',()=>{
 const r=calculateScreening(base());
 assert.equal(r.facilityPeakMW,13);assert.equal(r.annualEnergyMWh,79716);assert.equal(r.averageLoadMW,9.1);assert.equal(r.equivalentFullLoadHours,6132);assert.equal(r.gridCheck,'shortfall');assert.equal(r.gridShortfallMW,1);assert.equal(r.annualEnergyCost,7971600);
});
test('Total Facility Load is not multiplied by PUE',()=>{
 const r=calculateScreening(base({loadType:'facility',requiredPowerMW:'10',pue:'9',utilizationPercent:'100',gridCapacityMW:'10'}));
 assert.equal(r.facilityPeakMW,10);assert.equal(r.annualEnergyMWh,87600);assert.equal(r.gridCheck,'sufficient');assert.equal(r.fields.pue.state,'not_applicable');
});
test('grid adequacy compares nominal peak, not average load',()=>{
 const r=calculateScreening(base({loadType:'facility',utilizationPercent:'10',gridCapacityMW:'9.99'}));
 assert.equal(r.averageLoadMW,1);assert.equal(r.facilityPeakMW,10);assert.equal(r.gridCheck,'shortfall');assert.equal(r.gridShortfallMW,0.009999999999999787);
});
test('blank required inputs are unknown while explicit valid zero remains distinct',()=>{
 const blank=calculateScreening({loadType:'it',requiredPowerMW:'',pue:'',utilizationPercent:'',gridTariff:'',currency:'',gridCapacityMW:'',connectionDate:''});
 assert.equal(blank.ready,false);assert.equal(blank.fields.requiredPower.state,'unknown');assert.equal(blank.fields.pue.state,'unknown');assert.deepEqual(blank.missing,['requiredPower','utilization','pue']);
 const zero=calculateScreening(base({loadType:'facility',utilizationPercent:'0',gridTariff:'0',gridCapacityMW:'0'}));
 assert.equal(zero.fields.utilization.state,'provided_zero');assert.equal(zero.fields.tariff.state,'provided_zero');assert.equal(zero.fields.gridCapacity.state,'provided_zero');assert.equal(zero.annualEnergyMWh,0);assert.equal(zero.annualEnergyCost,0);assert.equal(zero.gridCheck,'shortfall');
});
test('tariff without currency does not create a currency-less cost',()=>{
 const r=calculateScreening(base({currency:''}));assert.equal(r.fields.tariff.state,'provided');assert.equal(r.currencyState,'unknown');assert.equal(r.costAvailable,false);assert.equal(r.annualEnergyCost,null);
});
test('missing grid capacity and tariff remain unknown, not zero',()=>{
 const r=calculateScreening(base({gridCapacityMW:'',gridTariff:''}));assert.equal(r.gridCheck,'unknown');assert.equal(r.gridCapacityMW,null);assert.equal(r.annualEnergyCost,null);
});
test('nonnumeric and out-of-range values are invalid',()=>{
 for(const overrides of [{requiredPowerMW:'not-a-number'},{requiredPowerMW:'0'},{pue:'0'},{utilizationPercent:'100.01'},{gridCapacityMW:'-1'},{gridTariff:'-0.2'}]){
  const r=calculateScreening(base(overrides));assert.equal(r.ready,false);assert.ok(Object.keys(r.errors).length>0);
 }
});
test('explicitly entered connection date is displayed without financial valuation',()=>{
 const r=calculateScreening(base({connectionDate:'2028-06-01'}));assert.equal(r.connectionDate,'2028-06-01');assert.equal(Object.hasOwn(r,'earlyConnectionValue'),false);
});
test('only server-confirmed K4 form storage qualifies as project inquiry submitted',()=>{
 assert.equal(shouldTrackInquirySubmitted({event:'lead_form_submit_success',form_type:'power_screening_inquiry',request_reference:'A1B2C3D4'}),true);
 for(const detail of [
  {event:'analysis_cta_clicked',form_type:'power_screening_inquiry'},
  {event:'lead_contact_click',channel:'email'},
  {event:'lead_form_submit_attempt',form_type:'power_screening_inquiry'},
  {event:'lead_form_submit_error',form_type:'power_screening_inquiry',request_reference:'A1B2C3D4'},
  {event:'lead_form_submit_success',form_type:'other',request_reference:'A1B2C3D4'},
  {event:'lead_form_submit_success',form_type:'power_screening_inquiry'}
 ])assert.equal(shouldTrackInquirySubmitted(detail),false);
});
test('screening analytics payload contains no project, location, tariff or contact values',()=>{
 assert.deepEqual(safeAnalyticsPayload('screening_completed','/gpu-estimate-hybrid-en/','en'),{event:'screening_completed',page_path:'/gpu-estimate-hybrid-en/',language:'en'});
});
