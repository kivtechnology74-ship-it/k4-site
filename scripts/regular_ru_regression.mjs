import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const paths = { ru: '../gpu-estimate/index.html', en: '../gpu-estimate/en-beta/index.html' };
const pages = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, readFileSync(new URL(path, import.meta.url), 'utf8')]));
const parsePage = (html, language) => {
  const profileMatch = html.match(/const PROFILES=(\[.*?\]);\nconst \$=/s);
  assert.ok(profileMatch, `${language}: embedded profile catalog exists`);
  const profiles = JSON.parse(profileMatch[1]);
  const demo = profiles.find(profile => profile.id === 'example_J320');
  assert.ok(demo, `${language}: demo profile exists`);
  const demoFunctionStart = html.indexOf('function applyJ320Example(){');
  const demoFunctionEnd = html.indexOf('\n}', demoFunctionStart);
  assert.ok(demoFunctionStart >= 0 && demoFunctionEnd > demoFunctionStart, `${language}: demo preset function exists`);
  const demoFunction = html.slice(demoFunctionStart, demoFunctionEnd);
  const demoValue = id => {
    const match = demoFunction.match(new RegExp(`\\$\\('${id}'\\)\\.value='([^']*)'`));
    if (match) return match[1];
    if (id === 'capex' && demoFunction.includes('452000000')) return '452000000';
    return null;
  };
  const getFunction = (name, nextName) => {
    const start = html.indexOf(`function ${name}(`);
    const end = html.indexOf(`function ${nextName}(`, start);
    assert.ok(start >= 0 && end > start, `${language}: can extract ${name}`);
    return html.slice(start, end);
  };
  const source = [
    getFunction('normalizeFuelRateUnit', 'fuelPriceUnitKey'),
    getFunction('annualFuel', 'avgFactor'),
    getFunction('avgFactor', 'calculateScenario'),
    getFunction('calculateScenario', 'readInput')
  ].join('\n');
  const sandbox = { PROFILES: profiles, Number, Math, Object, String };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const run = inputs => sandbox.calculateScenario({
    profile: demo,
    power: inputs.power ?? demo.power,
    units: Number(inputs.units),
    load: Number(inputs.load),
    hours: Number(inputs.hours),
    rate: Number(inputs.fuelRate),
    manualUnit: inputs.manualFuelUnit || demo.unit || '',
    fuelPrice: Number(inputs.fuelPrice),
    electricPrice: Number(inputs.electricPrice),
    heatPower: Number(inputs.heatPower),
    heatUse: Number(inputs.heatUse),
    heatPrice: Number(inputs.heatPrice),
    horizon: Number(inputs.horizon),
    zipRate: Number(inputs.zipCost),
    opsRate: Number(inputs.opsCost),
    oilRate: Number(inputs.oilCost),
    capexTotal: Number(inputs.capex),
    capexItems: { units: Number(inputs.capexUnits), project: Number(inputs.capexProject), works: Number(inputs.capexWorks), start: Number(inputs.capexStart), aux: Number(inputs.capexAux) },
    indices: Object.fromEntries(['electric','heat','fuel','zip','ops','oil'].map(key => { const id = `idx${key[0].toUpperCase()}${key.slice(1)}`; return [key, Number(inputs[id] ?? 0)]; })),
  });
  const inputs = Object.fromEntries(['units','load','hours','fuelRate','manualFuelUnit','fuelPrice','electricPrice','heatPower','heatUse','heatPrice','horizon','zipCost','opsCost','oilCost','capex','capexUnits','capexProject','capexWorks','capexStart','capexAux','idxElectric','idxHeat','idxFuel','idxZip','idxOps','idxOil'].map(id => [id, demoValue(id)]));
  assert.ok(Object.values(inputs).every(value => value !== null), `${language}: demo provides all required fields`);
  const ownDemoOutput = run(inputs);
  const selectable = profiles.filter(profile => !profile.is_example && !/заблок|blocked/i.test(profile.status || '') && Number.isFinite(profile.power));
  let labelInfo;
  if (language === 'ru') {
    const start = html.indexOf('function profileOptionModel(');
    const end = html.indexOf('\nfunction initProfiles()', start);
    assert.ok(start >= 0 && end > start, 'RU: short label helpers exist');
    const labelSandbox = { PROFILES: profiles, Number, Math, String, Set, Intl };
    vm.createContext(labelSandbox);
    vm.runInContext(`const fmt=(x,d=0)=>Number.isFinite(x)?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:d}).format(x):'—';\nfunction profileBrandGroup(brand){if(/^mtu(?:\\s|$)/i.test(brand))return 'mtu';if(/^mwm(?:\\s|$)/i.test(brand))return 'MWM';return brand}\n${html.slice(start,end)}\nthis.labels=profileAssertLabels(PROFILES.filter(p=>!p.is_example&&!/заблок/i.test(p.status||'')&&Number.isFinite(p.power)));`, labelSandbox);
    labelInfo = labelSandbox.labels;
  } else {
    const start = html.indexOf('function profileDisplayBrand(');
    const end = html.indexOf('function profileSearchAliases(', start);
    assert.ok(start >= 0 && end > start, 'EN: short label helpers exist');
    const labelSandbox = { PROFILES: profiles, Number, Math, Object, String, Intl };
    vm.createContext(labelSandbox);
    vm.runInContext(`const fmt=(x,d=0)=>Number.isFinite(x)?new Intl.NumberFormat('en-US',{maximumFractionDigits:d}).format(x):'—';\n${html.slice(start,end)}\nthis.labels=profileAssertLabels();`, labelSandbox);
    labelInfo = labelSandbox.labels;
  }
  assert.ok(labelInfo.length > 0, `${language}: option labels exist`);
  assert.ok(Math.max(...labelInfo.map(label => label.length)) <= 70, `${language}: option label max <= 70 characters`);
  assert.equal(new Set(labelInfo).size, labelInfo.length, `${language}: option labels are unique`);
  return { html, profiles, demo, inputs, run, ownDemoOutput, selectable, labels: labelInfo };
};

const ru = parsePage(pages.ru, 'ru');
const en = parsePage(pages.en, 'en');
const cssAssertions = [
  [ru.html, 'RU'], [en.html, 'EN']
];
for (const [html, language] of cssAssertions) {
  assert.match(html, /@media\s*\(max-width:\s*639px\)\s*\{\s*input,select,textarea\s*\{font-size:16px!important\}\s*\}/, `${language}: mobile controls are 16px`);
  assert.match(html, /@media print\{[\s\S]*?body>footer\.k4-consent-footer,#k4-consent-banner\{display:none!important\}/, `${language}: consent elements hidden in print`);
  assert.doesNotMatch(html, /maximum-scale\s*=|user-scalable\s*=/i, `${language}: viewport zoom remains enabled`);
}
assert.ok(/\.field \.field-error[\s\S]*aria-invalid/.test(ru.html), 'RU: inline validation styles are present');
assert.ok(/aria-invalid="true"[\s\S]*aria-describedby/.test(ru.html), 'RU: inline validation uses ARIA state and description');
assert.ok(/class="mobile-quick-results"[\s\S]*id="mobileCapacity"[\s\S]*id="mobilePayback"/.test(ru.html), 'RU: mobile result snapshot is present');
assert.ok(/\.panel\{position:static;max-height:none;overflow:visible\}/.test(ru.html), 'RU: form does not retain an internal scroll');
assert.ok(/\.capex-block #outIndexSummary[^}]*white-space:normal[^}]*overflow-wrap:anywhere/.test(ru.html), 'RU: CAPEX summary can wrap');
assert.ok(/@media\(max-width:600px\)\{\.three \.field label\{min-height:2\.8em\}\}/.test(ru.html), 'RU: mobile cost labels share a minimum height');
assert.ok(/body>footer\.k4-consent-footer\{gap:10px!important\}/.test(ru.html), 'RU: privacy footer links have a gap');
assert.ok(/setText\('outPayback',Number\.isFinite\(r\.payback\)\?fmt\(r\.payback,1\):'—'\)/.test(ru.html), 'RU: payback value contains only the number');
assert.ok(/Все модели · \$\{selectable\.length\} доступно · свой профиль отдельно · демо исключено/.test(ru.html), 'RU: counter is tied to selectable profiles');
assert.ok(/selectable=PROFILES\.filter\(p=>!p\.is_example&&allowed\(p\)\)/.test(ru.html), 'RU: demo is excluded from selectable profiles');
assert.ok(/demoOption\.hidden=true/.test(ru.html) && /demoOption\.dataset\.demo='true'/.test(ru.html), 'RU: demo-only option is hidden in the normal list');

const identicalInputs = { ...en.inputs, manualFuelUnit: ru.demo.unit, zipCost: '0.922', opsCost: '0.356', oilCost: '0.172' };
const enSameInputs = en.run(identicalInputs);
const ruSameInputs = ru.run(identicalInputs);
const stripLocalizedUnits = output => { const copy = JSON.parse(JSON.stringify(output)); if (copy.fuel) delete copy.fuel.unit; return copy; };
assert.deepEqual(stripLocalizedUnits(ruSameInputs), stripLocalizedUnits(enSameInputs), 'RU and EN full calculation outputs match for identical demo inputs');
const close = (actual, expected, label, tolerance = 0.00001) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
assert.equal(Math.round(enSameInputs.generationKwh), 82050313, 'same-input annual generation');
assert.equal(Math.round(enSameInputs.fuelFirst), 27382875, 'same-input fuel cost');
assert.equal(Math.round(enSameInputs.expensesFirst), 146355828, 'same-input total costs');
assert.equal(Math.round(enSameInputs.ebitdaFirst), 108000141, 'same-input EBITDA');
close(enSameInputs.marginFirst * 100, 42.5, 'same-input margin (%)', 0.05);
assert.equal(enSameInputs.capex, 452000000, 'same-input CAPEX');
close(enSameInputs.payback, 4.2, 'same-input payback (years)', 0.05);
const unitTotal = ['gas','zip','ops','oil'].reduce((sum,key)=>sum+Math.round(enSameInputs.unitCosts[key]*1000),0)/1000;
close(unitTotal, 1.784, 'same-input unit cost (RUB/kWh)');

const ruOwn = ru.ownDemoOutput;
const ruOwnDisplayedUnitTotal = ['gas','zip','ops','oil'].reduce((sum,key)=>sum+Math.round(ruOwn.unitCosts[key]*1000),0)/1000;
console.log(JSON.stringify({
  ruSelectableProfiles: ru.selectable.length,
  ruOptionLabels: { count: ru.labels.length, maximumLength: Math.max(...ru.labels.map(label=>label.length)) },
  enOptionLabels: { count: en.labels.length, maximumLength: Math.max(...en.labels.map(label=>label.length)) },
  identicalInputResult: { installedCapacityKW: ru.demo.power * Number(identicalInputs.units), generationKWh: ruSameInputs.generationKwh, fuelRUB: ruSameInputs.fuelFirst, totalCostsRUB: ruSameInputs.expensesFirst, ebitdaRUB: ruSameInputs.ebitdaFirst, marginPercent: ruSameInputs.marginFirst * 100, capexRUB: ruSameInputs.capex, paybackYears: ruSameInputs.payback, unitCostRUBPerKWh: unitTotal },
  ruOwnDemo: { inputs: ru.inputs, generationKWh: ruOwn.generationKwh, fuelRUB: ruOwn.fuelFirst, totalCostsRUB: ruOwn.expensesFirst, ebitdaRUB: ruOwn.ebitdaFirst, marginPercent: ruOwn.marginFirst * 100, capexRUB: ruOwn.capex, paybackYears: ruOwn.payback, unitCostRUBPerKWh: ruOwnDisplayedUnitTotal }
}, null, 2));
console.log('Static UI and formula comparison passed. Browser geometry, responsive styles and A4 pagination require the optional Playwright companion test.');
