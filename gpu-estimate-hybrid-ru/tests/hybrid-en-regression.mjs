import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(new URL('../..', import.meta.url).pathname);
const ruPage = await readFile(resolve(root, 'gpu-estimate-hybrid-ru/index.html'), 'utf8');
const enPage = await readFile(resolve(root, 'gpu-estimate-hybrid-en/index.html'), 'utf8');
const engineSource = await readFile(resolve(root, 'gpu-estimate-hybrid-ru/engine.js'), 'utf8');
const engine = {};
vm.runInNewContext(engineSource, engine, { filename: 'shared hybrid engine' });
assert.ok(engine.K4Hybrid?.simulateHybridScenario, 'EN/RU page shares the existing hybrid engine');

const noCyrillic = /[\u0400-\u04FF]/;
assert.doesNotMatch(enPage, noCyrillic, 'EN source contains no Cyrillic text, attributes or page-script strings');
assert.match(enPage, /<html lang="en">/);
assert.match(enPage, /<meta name="robots" content="noindex,follow">/);
assert.match(enPage, /SOC_COMPARABILITY_THRESHOLD=0\.001/);
assert.match(enPage, /class="table-scroll"/);
assert.match(enPage, /aria-invalid/);
assert.match(enPage, /@media\(max-width:639px\)\{input,select,textarea\{font-size:16px!important\}\}/);
assert.match(enPage, /<option>USD<\/option><option>EUR<\/option><option>AED<\/option><option>RUB<\/option><option value="OTHER">Other<\/option>/);
assert.match(enPage, /no currency conversion is performed/i);
assert.match(enPage, /Grid export is not modeled/i);
assert.match(enPage, /Discuss the project with K4/);
assert.match(enPage, /<script src="\/gpu-estimate-hybrid-ru\/engine\.js"/);
assert.match(ruPage, /<meta name="robots" content="noindex,follow">/);
assert.doesNotMatch(ruPage, /<script src="\/gpu-estimate-hybrid-ru\/engine\.js"/);

const extractPageFunctions = (page, language) => {
  const script = page.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, `${language}: inline controller exists`);
  const scenariosText = script.match(/const scenarios=(\[[\s\S]*?\]);/)?.[1];
  assert.ok(scenariosText, `${language}: five scenarios are defined`);
  const scenarios = vm.runInNewContext(scenariosText);
  const fmtText = script.match(/function fmt\(value,digits=1\)\{[^\n]+\}/)?.[0];
  const threshold = script.match(/const SOC_COMPARABILITY_THRESHOLD=0\.001;/)?.[0];
  const helpers = ['socThresholdLabel','calculateSocAdjustedCost','formatCostLine'].map(name => {
    const line = script.match(new RegExp(`function ${name}\\([^\\n]+`))?.[0];
    assert.ok(line, `${language}: ${name} exists`);
    return line;
  });
  assert.ok(fmtText && threshold, `${language}: locale formatter and threshold exist`);
  const sandbox = { Intl, Number, Math, String };
  vm.createContext(sandbox);
  vm.runInContext(`${fmtText}\n${threshold}\n${helpers.join('\n')}\nthis.costHelpers={calculateSocAdjustedCost,formatCostLine};`, sandbox);
  return { scenarios, costHelpers: sandbox.costHelpers };
};
const ru = extractPageFunctions(ruPage, 'RU');
const en = extractPageFunctions(enPage, 'EN');
assert.equal(ru.scenarios.length, 5);
assert.equal(en.scenarios.length, 5);
const rows = Array.from({ length: 8760 }, () => ({ load: 700, pv: 0 }));
const config = {
  profile: null, enginePowerKW: 1000, units: 2, frequencyHz: 60,
  rawFuelRate: 250, manualFuelUnit: 'Nm³', fuelPrice: 0.10, fuelPriceInput: true,
  gridPrice: 0.08, gridPriceInput: true, bessPowerKW: 500, bessEnergyKWh: 1000,
  rte: 0.88, initialSocPercent: 50, reserveSocPercent: 10,
};
const calculateRows = page => page.scenarios.map(scenario => ({
  scenario,
  result: engine.K4Hybrid.simulateHybridScenario(rows, scenario, config),
}));
const ruRows = calculateRows(ru);
const enRows = calculateRows(en);
const comparableResult = result => {
  const copy = JSON.parse(JSON.stringify(result));
  copy.scenario = { grid: copy.scenario.grid, gas: copy.scenario.gas, pv: copy.scenario.pv, bess: copy.scenario.bess };
  return copy;
};
for (let index = 0; index < 5; index++) {
  assert.deepEqual(comparableResult(enRows[index].result), comparableResult(ruRows[index].result), `scenario row ${index + 1}: EN and RU full numeric result objects match`);
  const ruCost = ru.costHelpers.calculateSocAdjustedCost(ruRows[index].result, config.gridPrice, config.fuelPrice);
  const enCost = en.costHelpers.calculateSocAdjustedCost(enRows[index].result, config.gridPrice, config.fuelPrice);
  assert.deepEqual(JSON.parse(JSON.stringify(enCost)), JSON.parse(JSON.stringify(ruCost)), `scenario row ${index + 1}: SOC-adjusted numeric values match`);
}
const byName = (page, items, flags) => items.find(item => Object.entries(flags).every(([key,value]) => item.scenario[key] === value)).result;
const ruGrid = byName(ru, ruRows, {grid:true,gas:false,pv:false,bess:false});
const enGrid = byName(en, enRows, {grid:true,gas:false,pv:false,bess:false});
const ruGas = byName(ru, ruRows, {grid:false,gas:true,pv:false,bess:false});
const enGas = byName(en, enRows, {grid:false,gas:true,pv:false,bess:false});
const ruBess = byName(ru, ruRows, {grid:false,gas:true,pv:false,bess:true});
const enBess = byName(en, enRows, {grid:false,gas:true,pv:false,bess:true});
const close = (actual, expected, tolerance, label) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected} ± ${tolerance}, got ${actual}`);
for (const [label,result] of [['RU grid',ruGrid],['EN grid',enGrid]]) { close(result.gridImportKWh/1000,6132,0.001,`${label} MWh`); close(result.cost,490560,0.01,`${label} cost`); }
for (const [label,result] of [['RU gas',ruGas],['EN gas',enGas]]) { close(result.gasGenerationKWh/1000,6132,0.001,`${label} MWh`); close(result.fuelQuantity,1533000,0.1,`${label} fuel`); close(result.cost,153300,0.01,`${label} cost`); }
for (const [label,result,page] of [['RU gas+BESS',ruBess,ru],['EN gas+BESS',enBess,en]]) {
  close(result.gasGenerationKWh/1000,6394.9,0.11,`${label} generation`);
  close(result.bessChargeKWh/1000,2190,0.11,`${label} charge`);
  close(result.bessDischargeKWh/1000,1927.1,0.11,`${label} discharge`);
  close(result.fuelQuantity,1598716.19,0.11,`${label} fuel`);
  close(result.endSocKWh,569,0.11,`${label} final SOC`);
  close(result.endSocPercent,56.9,0.02,`${label} final SOC percent`);
  close(result.cost,159871.619168,0.01,`${label} cost`);
  const adjusted=page.costHelpers.calculateSocAdjustedCost(result,config.gridPrice,config.fuelPrice);
  close(adjusted.adjustedCost,159869.893129,0.01,`${label} SOC-adjusted cost`);
  assert.equal(page.costHelpers.formatCostLine(result,'USD',config.gridPrice,config.fuelPrice).primary.replace(/[\u00a0\u202f]/g,','),'USD 159,872');
}
assert.equal(en.costHelpers.formatCostLine(enBess,'USD',config.gridPrice,config.fuelPrice).secondary,'SOC-adj.: USD 159,870 (-USD 2)');
const largerConfig={...config,bessEnergyKWh:20000,initialSocPercent:90,reserveSocPercent:10};
const larger=engine.K4Hybrid.simulateHybridScenario(rows,en.scenarios.find(s=>s.gas&&s.bess&&!s.grid),largerConfig);
const largerAdjusted=en.costHelpers.calculateSocAdjustedCost(larger,largerConfig.gridPrice,largerConfig.fuelPrice);
const largerDisplay=en.costHelpers.formatCostLine(larger,'USD',largerConfig.gridPrice,largerConfig.fuelPrice);
assert.equal(largerDisplay.primary,'Not comparable');
assert.equal(largerDisplay.secondary,'SOC-adj.: USD 159,872 (+USD 388)');
close(largerAdjusted.adjustment,388.273961,0.01,'20 MWh adjustment');
const gridBess=byName(en,enRows,{grid:true,gas:true,pv:true,bess:true});
assert.equal(gridBess.costComparable,enBess.costComparable,'hybrid scenario SOC comparability is preserved');
console.log('Hybrid EN static and calculation regression passed: no Cyrillic source, 5 scenario outputs match RU, SOC adjustments match, golden values and 20 MWh threshold verified.');
