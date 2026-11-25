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
assert.equal(demo.profiles.length, 116, '106 retained profiles plus ten Jenbacher profiles');
assert.ok(demo.profiles.some(p => p.id === 'example_J320'), 'J320 example remains');
assert.ok(demo.profiles.every(p => !JSON.stringify(p).toLowerCase().includes('k4')), 'no retained profile contains K4');
assert.doesNotMatch(candidate, /k4/i, 'page source contains no K4 reference');
const retainedBase = base.profiles.filter(p => !JSON.stringify(p).toLowerCase().includes('k4'));
assert.deepEqual(demo.profiles.filter(p => base.profiles.some(b => b.id === p.id)).map(p => p.id), retainedBase.map(p => p.id), 'retained catalog order and IDs are unchanged');
const expectedJenbacher = [
  ['jenbacher_J312_D01', 'J312', 635, 1617, 791],
  ['jenbacher_J316_D01', 'J316', 851, 2178, 1081],
  ['jenbacher_J320_D01', 'J320', 1067, 2697, 1332],
  ['jenbacher_J412_B05', 'J412', 901, 2098, 945],
  ['jenbacher_J416_B05', 'J416', 1202, 2795, 1252],
  ['jenbacher_J420_B01', 'J420', 1410, 3374, 1573],
  ['jenbacher_J612_F13', 'J612', 1817, 4249, 1917],
  ['jenbacher_J616_F13', 'J616', 2433, 5665, 2556],
  ['jenbacher_J620_F13', 'J620', 3044, 7082, 3188],
  ['jenbacher_J624_H01', 'J624', 4404, 9463, 4057],
];
const jenbacherProfiles = demo.profiles.filter(p => p.brand === 'Jenbacher');
assert.deepEqual(jenbacherProfiles.map(p => [p.id,p.engine,p.power,p.samples['100'],p.heat_kw_100]), expectedJenbacher, 'all ten Jenbacher ratings match the RU release catalog');
assert.ok(jenbacherProfiles.every(p => p.mode === 'thermal_kw' && p.source.includes('INNIO Jenbacher Product Handbook PHB 2021')), 'Jenbacher fuel-input units and source are retained');
for (const name of ['normalizeFuelRateUnit','annualFuel','avgFactor','calculateScenario']) {
  const next = { normalizeFuelRateUnit:'fuelPriceUnitKey', annualFuel:'avgFactor', avgFactor:'calculateScenario', calculateScenario:'readInput' }[name];
  assert.equal(demo.calculations.includes(`function ${name}(`), true);
  assert.equal(demo.calculations.slice(demo.calculations.indexOf(`function ${name}(`), demo.calculations.indexOf(`function ${next}(`)), base.calculations.slice(base.calculations.indexOf(`function ${name}(`), base.calculations.indexOf(`function ${next}(`)), `${name}: unchanged calculation code`);
}
const baseById = new Map(base.profiles.map(p => [p.id,p]));
for (const profile of demo.profiles.filter(p => baseById.has(p.id))) {
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
for (const profile of jenbacherProfiles) {
  const hours = 8760;
  const rate = profile.samples['100'];
  const output = demo.sandbox.calculateScenario({
    profile, power:profile.power, units:1, load:100, hours, rate, manualUnit:'',
    fuelPrice:0.1, electricPrice:1, heatPower:profile.heat_kw_100, heatUse:0,
    heatPrice:0, horizon:1, zipRate:0, opsRate:0, oilRate:0,
    capexTotal:0, capexItems:{units:0,project:0,works:0,start:0,aux:0},
    indices:{electric:0,heat:0,fuel:0,zip:0,ops:0,oil:0},
  });
  const expectedGeneration = profile.power * hours;
  const expectedFuelEnergy = rate * hours;
  assert.equal(output.generationKwh, expectedGeneration, `${profile.engine}: annual generation`);
  assert.equal(output.fuel.qty, expectedFuelEnergy, `${profile.engine}: thermal fuel-input quantity`);
  assert.equal(output.fuel.unit, 'кВт·ч тепла', `${profile.engine}: displayed fuel unit`);
  assert.equal(output.fuelFirst, expectedFuelEnergy * 0.1, `${profile.engine}: fuel cost`);
  assert.equal(output.expensesFirst, expectedFuelEnergy * 0.1, `${profile.engine}: total cost with other cost rates set to zero`);
  assert.equal(output.heatPotentialGcal, profile.heat_kw_100 * hours / 1163, `${profile.engine}: useful-heat conversion`);
}
const demoProfile = demo.profiles.find(p => p.id === 'example_J320');
const demoOutput = demo.sandbox.calculateScenario({profile:demoProfile,power:1063,units:10,load:95,hours:8125,rate:274,manualUnit:'Нм³/ч',fuelPrice:1.23,electricPrice:3.1,heatPower:1000,heatUse:0,heatPrice:0,horizon:10,zipRate:.922,opsRate:.356,oilRate:.172,capexTotal:452000000,capexItems:{units:370000000,project:14000000,works:35000000,start:15000000,aux:18000000},indices:{electric:0,heat:0,fuel:0,zip:0,ops:0,oil:0}});
assert.equal(demoOutput.expensesFirst, 146355828.125, 'demo total cost golden value');
assert.equal(demoOutput.ebitdaFirst, 108000140.625, 'demo EBITDA golden value');
console.log(JSON.stringify({status:'PASS',originalProfiles:base.profiles.length,feedbackProfiles:demo.profiles.length,removedOriginalProfiles:base.profiles.length-retainedBase.length,restoredJenbacherProfiles:jenbacherProfiles.length,retainedProfileCalculations:retainedBase.length,jenbacherIndependentCalculations:jenbacherProfiles.length,demo:{totalCostsRUB:demoOutput.expensesFirst,ebitdaFirst:demoOutput.ebitdaFirst}}));
