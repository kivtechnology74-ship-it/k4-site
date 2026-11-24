import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../gpu-estimate/en-beta/index.html', import.meta.url), 'utf8');
const profileMatch = html.match(/const PROFILES=(\[.*?\]);\nconst \$=/s);
assert.ok(profileMatch, 'PROFILES catalog is embedded in the calculator page');
const profiles = JSON.parse(profileMatch[1]);
const demo = profiles.find(profile => profile.id === 'example_J320');
assert.ok(demo, 'Demo example profile is present');

const demoFunction = html.slice(html.indexOf('function applyJ320Example(){'), html.indexOf('\n}', html.indexOf('function applyJ320Example(){')));
assert.ok(demoFunction.includes("$('units').value='10'"), 'Demo example sets ten units');
const demoValue = id => {
  const match = demoFunction.match(new RegExp(`\\$\\('${id}'\\)\\.value='([^']*)'`));
  assert.ok(match, `Demo example provides ${id}`);
  return match[1];
};

const getFunction = (name, nextName) => {
  const start = html.indexOf(`function ${name}(`);
  const end = html.indexOf(`function ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, `Can extract ${name}`);
  return html.slice(start, end);
};
const calculations = [
  getFunction('normalizeFuelRateUnit', 'fuelPriceUnitKey'),
  getFunction('annualFuel', 'avgFactor'),
  getFunction('avgFactor', 'calculateScenario'),
  getFunction('calculateScenario', 'readInput')
].join('\n');
const sandbox = { PROFILES: profiles, Number, Math, Object, String };
vm.createContext(sandbox);
vm.runInContext(calculations, sandbox);

const number = id => Number(demoValue(id));
const result = sandbox.calculateScenario({
  profile: demo,
  power: demo.power,
  units: number('units'),
  load: number('load'),
  hours: number('hours'),
  rate: number('fuelRate'),
  manualUnit: demoValue('manualFuelUnit'),
  fuelPrice: number('fuelPrice'),
  electricPrice: number('electricPrice'),
  heatPower: number('heatPower'),
  heatUse: number('heatUse'),
  heatPrice: number('heatPrice'),
  horizon: number('horizon'),
  zipRate: number('zipCost'),
  opsRate: number('opsCost'),
  oilRate: number('oilCost'),
  capexTotal: 452000000,
  capexItems: { units: 370000000, project: 14000000, works: 35000000, start: 15000000, aux: 18000000 },
  indices: { electric: 0, heat: 0, fuel: 0, zip: 0, ops: 0, oil: 0 }
});

const closeTo = (actual, expected, label, tolerance = 0.00001) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
assert.equal(demo.power * number('units'), 10630, 'installed capacity (kW)');
assert.equal(Math.round(result.generationKwh), 82050313, 'annual generation (kWh)');
assert.equal(Math.round(result.fuelFirst), 27382875, 'fuel cost (RUB)');
assert.equal(Math.round(result.expensesFirst), 146355828, 'total costs (RUB)');
assert.equal(Math.round(result.ebitdaFirst), 108000141, 'EBITDA (RUB)');
closeTo(result.marginFirst * 100, 42.5, 'EBITDA margin (%)', 0.05);
assert.equal(result.capex, 452000000, 'CAPEX (RUB)');
closeTo(result.payback, 4.2, 'simple payback (years)', 0.05);
const displayedUnitTotal = ['gas', 'zip', 'ops', 'oil'].reduce((sum, key) => sum + Math.round(result.unitCosts[key] * 1000), 0) / 1000;
closeTo(displayedUnitTotal, 1.784, 'displayed electricity cost total (RUB/kWh)');
console.log('Demo regression passed: 9 financial and capacity assertions.');
