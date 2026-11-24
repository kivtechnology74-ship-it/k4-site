import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../gpu-estimate/en-beta/index.html', import.meta.url), 'utf8');
const profileMatch = html.match(/const PROFILES=(\[.*?\]);\nconst \$=/s);
assert.ok(profileMatch, 'PROFILES catalog is embedded in the calculator page');
const profiles = JSON.parse(profileMatch[1]);
const demo = profiles.find(profile => profile.id === 'example_J320');
const baseline = JSON.parse(readFileSync(new URL('./ui_audit_2_profile_results.baseline.json', import.meta.url), 'utf8'));
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
assert.equal(baseline.profiles.length, profiles.filter(profile => !profile.is_example).length, 'baseline covers every selectable profile');
const normalizeOutput = value => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'number' && !Number.isFinite(item) ? `__${String(item)}__` : item));
const currentProfileOutputs = profiles.filter(profile => !profile.is_example).map(profile => {
  const points = Object.keys(profile.samples || {}).map(Number).filter(Number.isFinite).sort((a, b) => b - a);
  const load = points[0] ?? 100;
  const rate = points.length ? profile.samples[String(load)] : NaN;
  const output = sandbox.calculateScenario({
    profile, power: profile.power, units: 2, load, hours: 8000, rate,
    manualUnit: profile.unit || profile.source_unit || 'unit/h',
    fuelPrice: 1.23, electricPrice: 3.1, heatPower: profile.heat_kw_100 || NaN,
    heatUse: 20, heatPrice: 75, horizon: 10, zipRate: .922, opsRate: .356, oilRate: .172,
    capexTotal: 452000000,
    capexItems: { units: 370000000, project: 14000000, works: 35000000, start: 15000000, aux: 18000000 },
    indices: { electric: 1, heat: 2, fuel: 3, zip: 4, ops: 5, oil: 6 }
  });
  return { id: profile.id, load, rate: Number.isFinite(rate) ? rate : null, output: normalizeOutput(output) };
});
assert.deepEqual(currentProfileOutputs, baseline.profiles, 'full calculation output object is unchanged for all selectable profiles');
const labelStart = html.indexOf('function profileDisplayBrand(');
const labelEnd = html.indexOf('function profileSearchAliases(', labelStart);
assert.ok(labelStart >= 0 && labelEnd > labelStart, 'display-label helpers are present');
const labelSandbox = { PROFILES: profiles, Number, Math, Object, String, Intl };
vm.createContext(labelSandbox);
vm.runInContext(`const fmt=(x,d=0)=>Number.isFinite(x)?new Intl.NumberFormat('en-US',{maximumFractionDigits:d}).format(x):'—';\n${html.slice(labelStart, labelEnd)}\nthis.labels=profileAssertLabels();`, labelSandbox);
assert.equal(labelSandbox.labels.length, 146, 'all selectable profiles have an option label');
assert.equal(new Set(labelSandbox.labels).size, 146, 'selectable profile labels are unique');
const maxLabelLength = Math.max(...labelSandbox.labels.map(label => label.length));
const meanLabelLength = labelSandbox.labels.reduce((sum, label) => sum + label.length, 0) / labelSandbox.labels.length;
assert.ok(maxLabelLength <= 70, `maximum option label length <= 70 (got ${maxLabelLength})`);
for (const profile of profiles.filter(profile => !profile.is_example)) {
  const tooltip = vm.runInContext(`profileOptionTooltip(PROFILES.find(p=>p.id===${JSON.stringify(profile.id)}))`, labelSandbox);
  assert.ok(tooltip.includes(profile.model || 'not specified'), `tooltip preserves original model: ${profile.id}`);
}
assert.match(html.match(/function profileSearchText\(p\)\{([^}]+)\}/)?.[1] || '', /p\.model/, 'search still indexes the full original model string');
console.log(`Regression passed: 9 demo financial assertions; full output objects unchanged for ${currentProfileOutputs.length} profiles; labels unique, max ${maxLabelLength} chars, mean ${meanLabelLength.toFixed(1)} chars.`);
