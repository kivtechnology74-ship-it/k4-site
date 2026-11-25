import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const original = readFileSync(new URL('../../gpu-estimate/index.html', import.meta.url), 'utf8');
const candidate = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const parse = (html, label) => {
  const match = html.match(/const PROFILES=(\[.*?\]);\nconst \$=/s);
  assert.ok(match, `${label}: profile catalog parses`);
  const profiles = JSON.parse(match[1]);
  const getFunction = (name, nextName) => {
    const start = html.indexOf(`function ${name}(`);
    const end = html.indexOf(`function ${nextName}(`, start);
    assert.ok(start >= 0 && end > start, `${label}: ${name} exists`);
    return html.slice(start, end);
  };
  const calculations = [
    getFunction('normalizeFuelRateUnit', 'fuelPriceUnitKey'),
    getFunction('annualFuel', 'avgFactor'),
    getFunction('avgFactor', 'calculateScenario'),
    getFunction('calculateScenario', 'readInput'),
  ].join('\n');
  const sandbox = { PROFILES: profiles, Number, Math, Object, String };
  vm.createContext(sandbox);
  vm.runInContext(calculations, sandbox);
  return { profiles, sandbox, calculations };
};

const base = parse(original, 'production base');
const demo = parse(candidate, 'feedback copy');
assert.equal(demo.profiles.length, 106, '31 profiles that cite K4 archive are excluded');
assert.ok(demo.profiles.some(p => p.id === 'example_J320'), 'J320 example remains');
assert.ok(demo.profiles.every(p => !JSON.stringify(p).toLowerCase().includes('k4')), 'no retained profile contains K4');
assert.doesNotMatch(candidate, /k4/i, 'page source contains no K4 reference');
assert.deepEqual([...demo.profiles.map(p => p.id)], [...base.profiles.filter(p => !JSON.stringify(p).toLowerCase().includes('k4')).map(p => p.id)], 'remaining catalog order and IDs are unchanged');
for (const name of ['normalizeFuelRateUnit','annualFuel','avgFactor','calculateScenario']) {
  const next = { normalizeFuelRateUnit:'fuelPriceUnitKey', annualFuel:'avgFactor', avgFactor:'calculateScenario', calculateScenario:'readInput' }[name];
  assert.equal(demo.calculations.includes(`function ${name}(`), true);
  assert.equal(demo.calculations.slice(demo.calculations.indexOf(`function ${name}(`), demo.calculations.indexOf(`function ${next}(`)), base.calculations.slice(base.calculations.indexOf(`function ${name}(`), base.calculations.indexOf(`function ${next}(`)), `${name}: unchanged calculation code`);
}
const baseById = new Map(base.profiles.map(p => [p.id,p]));
for (const profile of demo.profiles) {
  const inputs = {
    profile, power: profile.power, units: 2, load: 50, hours: 4000,
    rate: 1, manualUnit: profile.unit || 'Нм³/ч', fuelPrice: 1.2,
    electricPrice: 0.3, heatPower: profile.heat_kw_100 || 0, heatUse: 0,
    heatPrice: 0, horizon: 10, zipRate: 0.1, opsRate: 0.2, oilRate: 0.05,
    capexTotal: 100000000,
    capexItems: { units: 70000000, project: 10000000, works: 10000000, start: 5000000, aux: 5000000 },
    indices: { electric: 0, heat: 0, fuel: 0, zip: 0, ops: 0, oil: 0 },
  };
  const originalProfile = baseById.get(profile.id);
  const before = base.sandbox.calculateScenario({ ...inputs, profile: originalProfile });
  const after = demo.sandbox.calculateScenario(inputs);
  assert.equal(JSON.stringify(after), JSON.stringify(before), `${profile.id}: computed output unchanged`);
}
const demoProfile = demo.profiles.find(p => p.id === 'example_J320');
const demoOutput = demo.sandbox.calculateScenario({profile:demoProfile,power:1063,units:10,load:95,hours:8125,rate:274,manualUnit:'Нм³/ч',fuelPrice:1.23,electricPrice:3.1,heatPower:1000,heatUse:0,heatPrice:0,horizon:10,zipRate:.922,opsRate:.356,oilRate:.172,capexTotal:452000000,capexItems:{units:370000000,project:14000000,works:35000000,start:15000000,aux:18000000},indices:{electric:0,heat:0,fuel:0,zip:0,ops:0,oil:0}});
assert.equal(demoOutput.expensesFirst, 146355828.125, 'demo total cost golden value');
assert.equal(demoOutput.ebitdaFirst, 108000140.625, 'demo EBITDA golden value');
console.log(JSON.stringify({status:'PASS',originalProfiles:base.profiles.length,feedbackProfiles:demo.profiles.length,removed:base.profiles.length-demo.profiles.length,sharedProfilesCompared:demo.profiles.length,profileCalculations:demo.profiles.length,demo:{totalCostsRUB:demoOutput.expensesFirst,ebitdaFirst:demoOutput.ebitdaFirst}}));
