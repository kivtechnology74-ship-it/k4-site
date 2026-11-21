'use strict';
(function(root){
 const HOURS_PER_YEAR=8760;
 const parse=(raw,min,max,allowZero=true)=>{
  if(raw===null||raw===undefined||String(raw).trim()==='')return{state:'unknown',value:null};
  const value=Number(raw);
  if(!Number.isFinite(value))return{state:'invalid',value:null,issue:'not_number'};
  if(value<min||(!allowZero&&value===0)||(max!==undefined&&value>max))return{state:'invalid',value,issue:'out_of_range'};
  return{state:value===0?'provided_zero':'provided',value};
 };
 function calculateScreening(input={}){
  const fields={
   requiredPower:parse(input.requiredPowerMW,0,undefined,false),
   utilization:parse(input.utilizationPercent,0,100,true),
   pue:input.loadType==='it'?parse(input.pue,1,undefined,true):{state:'not_applicable',value:1},
   tariff:parse(input.gridTariff,0,undefined,true),
   gridCapacity:parse(input.gridCapacityMW,0,undefined,true)
  };
  const errors={};
  for(const [key,item] of Object.entries(fields))if(item.state==='invalid')errors[key]=item.issue;
  if(!['it','facility'].includes(input.loadType))errors.loadType='required';
  const missing=[];
  for(const key of ['requiredPower','utilization'])if(fields[key].state==='unknown')missing.push(key);
  if(input.loadType==='it'&&fields.pue.state==='unknown')missing.push('pue');
  const currency=String(input.currency||'').trim().toUpperCase();
  const currencyState=currency?'provided':'unknown';
  const date=String(input.connectionDate||'').trim();
  const ready=!Object.keys(errors).length&&!missing.length;
  if(!ready)return{ready:false,fields,errors,missing,currencyState,connectionDate:date||null};
  const facilityPeakMW=fields.requiredPower.value*(input.loadType==='it'?fields.pue.value:1);
  const utilizationPercent=fields.utilization.value;
  const equivalentFullLoadHours=HOURS_PER_YEAR*utilizationPercent/100;
  const annualEnergyMWh=facilityPeakMW*equivalentFullLoadHours;
  const averageLoadMW=annualEnergyMWh/HOURS_PER_YEAR;
  const costAvailable=fields.tariff.state!=='unknown'&&fields.tariff.state!=='invalid'&&currencyState==='provided';
  const annualEnergyCost=costAvailable?annualEnergyMWh*1000*fields.tariff.value:null;
  const capacityKnown=fields.gridCapacity.state!=='unknown'&&fields.gridCapacity.state!=='invalid';
  const gridCheck=capacityKnown?(fields.gridCapacity.value>=facilityPeakMW?'sufficient':'shortfall'):'unknown';
  return{ready:true,fields,errors,missing,currency,currencyState,loadType:input.loadType,enteredPowerMW:fields.requiredPower.value,pue:fields.pue.value,facilityPeakMW,utilizationPercent,equivalentFullLoadHours,annualEnergyMWh,averageLoadMW,gridTariff:fields.tariff.state==='invalid'?null:fields.tariff.value,annualEnergyCost,costAvailable,gridCapacityMW:capacityKnown?fields.gridCapacity.value:null,gridCheck,gridShortfallMW:gridCheck==='shortfall'?facilityPeakMW-fields.gridCapacity.value:gridCheck==='sufficient'?0:null,connectionDate:date||null,energyChargeOnly:true};
 }
 const api={HOURS_PER_YEAR,calculateScreening};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.K4Screening=api;
})(typeof globalThis!=='undefined'?globalThis:this);
