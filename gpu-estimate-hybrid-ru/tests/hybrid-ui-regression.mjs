import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.resolve(here, '../index.html');
const enginePath = path.resolve(here, '../engine.js');
const page = fs.readFileSync(pagePath, 'utf8');
const engine = fs.readFileSync(enginePath, 'utf8');
const thresholdDefinitions = [...page.matchAll(/const SOC_COMPARABILITY_THRESHOLD\s*=\s*([\d.]+);/g)];
assert.equal(thresholdDefinitions.length, 1, 'page defines the SOC threshold exactly once');
const SOC_COMPARABILITY_THRESHOLD = Number(thresholdDefinitions[0][1]);
assert.equal(SOC_COMPARABILITY_THRESHOLD, 0.001, 'SOC comparability threshold is 0.1%');
assert.doesNotMatch(page, /0[,.]5\s*%|0\.005/, 'page no longer contains the old hard-coded 0.5% threshold');
assert.match(page, /<span id="socThresholdPercent"><\/span>/, 'results explanation renders the threshold dynamically');
assert.match(page, /<meta name="robots" content="noindex,follow">/, 'RU hybrid calculator remains noindex,follow');
assert.match(page, /<select id="currency"><option>USD<\/option><option>EUR<\/option><option>AED<\/option><option>RUB<\/option><option value="OTHER">Другая<\/option><\/select>/, 'currency choices match owner-approved list');
assert.match(page, /Все цены вводятся в выбранной валюте; пересчёт валют не выполняется\./, 'currency conversion limitation is disclosed near cost inputs');
assert.match(page, /Отдача в сеть не моделируется/, 'rules explicitly state that grid export is not modeled');
const customCurrencyValidation = page.match(/\/\^\[A-Z\]\{3\}\$\//);
assert.ok(customCurrencyValidation, 'custom currency uses the existing three-letter Latin code validation');
const currencyCodeIsValid = new RegExp(customCurrencyValidation[0].slice(1, -1));
assert.equal(currencyCodeIsValid.test('RUB'), true, 'RUB remains a valid currency code');
assert.equal(currencyCodeIsValid.test('руб'), false, 'Cyrillic currency text is rejected');
const scenariosMatch = page.match(/const scenarios=(\[[\s\S]*?\]);/);
assert.ok(scenariosMatch, 'read scenarios from the page controller');
const scenarios = vm.runInNewContext(scenariosMatch[1]);
const sandbox = {};
vm.runInNewContext(engine, sandbox, { filename: enginePath });
const hybrid = sandbox.K4Hybrid;
assert.ok(hybrid?.simulateHybridScenario, 'load the page calculation engine');

const nominalLoadKW = 1000;
const loadFactor = 70 / 100;
const annualLoadMWh = nominalLoadKW * loadFactor * 8760 / 1000;
assert.equal(annualLoadMWh, 6132);
const rows = Array.from({ length: 8760 }, () => ({ load: nominalLoadKW * loadFactor, pv: 0 }));
const config = {
  profile: null,
  enginePowerKW: 1000,
  units: 2,
  frequencyHz: 60,
  rawFuelRate: 250,
  manualFuelUnit: 'Нм³',
  fuelPrice: 0.1,
  fuelPriceInput: true,
  gridPrice: 0.08,
  gridPriceInput: true,
  bessPowerKW: 500,
  bessEnergyKWh: 1000,
  rte: 0.88,
  initialSocPercent: 50,
  reserveSocPercent: 10,
};
const results = scenarios.map(scenario => ({
  ...scenario,
  result: hybrid.simulateHybridScenario(rows, scenario, config),
}));
const byName = name => results.find(item => item.name === name)?.result;
const formatFunction = page.match(/function fmt\(value,digits=1\)\{return Number\(value\)\.toLocaleString\('ru-RU',\{minimumFractionDigits:digits,maximumFractionDigits:digits\}\)\}/);
assert.ok(formatFunction, 'page exposes a central result formatter');
const format = vm.runInNewContext(`(value,digits=1)=>Number(value).toLocaleString('ru-RU',{minimumFractionDigits:digits,maximumFractionDigits:digits})`);
const costHelper = page.match(/function calculateSocAdjustedCost\([^\n]+/);
const costDisplayHelper = page.match(/function formatCostLine\([^\n]+/);
const thresholdLabelHelper = page.match(/function socThresholdLabel\(\)\{[^\n]+/);
assert.ok(costHelper && costDisplayHelper && thresholdLabelHelper, 'page exposes SOC adjustment, display and threshold-label helpers');
const costHelpers = vm.runInNewContext(`${thresholdDefinitions[0][0]}\n${thresholdLabelHelper[0]}\n${costHelper[0]}\n${costDisplayHelper[0]}\n({SOC_COMPARABILITY_THRESHOLD,socThresholdLabel,calculateSocAdjustedCost,formatCostLine})`, { fmt: format });
assert.equal(costHelpers.socThresholdLabel(), '0,1%', 'threshold is formatted in Russian locale for user-facing text');
assert.match(page, /Исходные затраты сопоставимы при поправке на SOC менее \$\{socThresholdLabel\(\)\}/, 'result note uses the same formatted threshold');
const nbsp = '\u00a0';
assert.equal(format(6394.9,1), `6${nbsp}394,9`, 'MWh uses one decimal and Russian narrow no-break grouping');
assert.equal(format(1598716.19,0), `1${nbsp}598${nbsp}716`, 'fuel uses whole units and Russian grouping');
assert.equal(`USD ${format(153300,0)}`, `USD 153${nbsp}300`, 'cost includes currency and whole-unit formatting');
assert.equal(`${format(569,1)} / ${format(56.9,1)}%`, '569,0 / 56,9%', 'SOC values use one decimal');
const approx = (actual, expected, tolerance, label) => {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ± ${tolerance}, received ${actual}`);
};
const grid = byName('Только сеть');
const gas = byName('Только ГПУ');
const gasBess = byName('ГПУ + BESS');
const gasPvBess = byName('ГПУ + солнечная генерация + BESS');
const gridGasPvBess = byName('Сеть + ГПУ + солнечная генерация + BESS');
assert.ok(grid && gas && gasBess && gasPvBess && gridGasPvBess, 'page exposes all five scenarios');
approx(grid.gridImportKWh / 1000, 6132, 1e-8, 'grid import MWh');
approx(grid.cost, 490560, 1e-6, 'grid cost');
approx(gas.gasGenerationKWh / 1000, 6132, 1e-8, 'gas generation MWh');
approx(gas.fuelQuantity, 1533000, 1e-6, 'gas fuel Nm3');
approx(gas.cost, 153300, 1e-6, 'gas cost');
approx(gasBess.gasGenerationKWh / 1000, 6394.9, 0.11, 'gas + BESS generation MWh');
approx(gasBess.bessChargeKWh / 1000, 2190, 0.11, 'BESS charge MWh');
approx(gasBess.bessDischargeKWh / 1000, 1927.1, 0.11, 'BESS discharge MWh');
approx(gasBess.fuelQuantity, 1598716.19, 0.11, 'gas + BESS fuel Nm3');
const socAdjusted = costHelpers.calculateSocAdjustedCost(gasBess, config.gridPrice, config.fuelPrice);
assert.equal(socAdjusted.comparable, true, 'golden gas + BESS cost is comparable below the 0.1% threshold');
approx(socAdjusted.deltaSocKWh, 69, 0.11, 'golden SOC delta kWh');
approx(socAdjusted.valuePerKWh, gasBess.fuelQuantity * config.fuelPrice / gasBess.gasGenerationKWh, 1e-12, 'marginal gas cost per kWh');
approx(socAdjusted.adjustedCost, gasBess.cost - socAdjusted.deltaSocKWh * socAdjusted.valuePerKWh, 1e-8, 'SOC-adjusted cost formula');
assert.ok(socAdjusted.adjustmentShare < SOC_COMPARABILITY_THRESHOLD, 'golden adjustment share is below the configured threshold');
const goldenCostDisplay = costHelpers.formatCostLine(gasBess, 'USD', config.gridPrice, config.fuelPrice);
assert.equal(goldenCostDisplay.primary, `USD ${format(gasBess.cost, 0)}`, 'golden cost is shown as comparable');
assert.equal(goldenCostDisplay.primary, `USD 159${nbsp}872`, 'golden scenario shows USD 159,872');
assert.equal(goldenCostDisplay.secondary, `SOC-корр.: USD 159${nbsp}870 (−USD 2)`, 'golden adjusted line shows USD 159,870 and −USD 2');
const gridAdjusted = costHelpers.calculateSocAdjustedCost(grid, config.gridPrice, config.fuelPrice);
assert.equal(gridAdjusted.valuePerKWh, config.gridPrice, 'grid price is the fallback when no gas generation is present');
assert.equal(gridAdjusted.comparable, true, 'grid-only scenario with unchanged SOC is comparable');
const thresholdConfig = { ...config, bessEnergyKWh: 20000, initialSocPercent: 90, reserveSocPercent: 10 };
const thresholdResult = hybrid.simulateHybridScenario(rows, scenarios.find(item => item.name === 'ГПУ + BESS'), thresholdConfig);
const thresholdAdjusted = costHelpers.calculateSocAdjustedCost(thresholdResult, thresholdConfig.gridPrice, thresholdConfig.fuelPrice);
const thresholdDisplay = costHelpers.formatCostLine(thresholdResult, 'USD', thresholdConfig.gridPrice, thresholdConfig.fuelPrice);
assert.ok(thresholdAdjusted.adjustmentShare > SOC_COMPARABILITY_THRESHOLD, '20 MWh scenario exceeds the configured 0.1% threshold');
assert.equal(thresholdAdjusted.comparable, false, 'large-battery scenario is not directly comparable');
assert.equal(thresholdDisplay.primary, 'Не сопоставимо', 'threshold case shows the required non-comparable label');
assert.equal(thresholdDisplay.secondary, `SOC-корр.: USD 159${nbsp}872 (+USD 388)`, '20 MWh case shows adjusted cost and +USD 388');
const boundaryCost = 100000;
const boundaryValuePerKWh = 0.1;
const boundaryRelativeOffset = 0.0001;
const boundaryResult = share => ({ cost: boundaryCost, fuelQuantity: 1000000, gasGenerationKWh: 1000000, startSocKWh: 0, endSocKWh: boundaryCost * share / boundaryValuePerKWh });
const belowBoundaryResult = boundaryResult(SOC_COMPARABILITY_THRESHOLD * (1 - boundaryRelativeOffset));
const aboveBoundaryResult = boundaryResult(SOC_COMPARABILITY_THRESHOLD * (1 + boundaryRelativeOffset));
const belowBoundary = costHelpers.calculateSocAdjustedCost(belowBoundaryResult, config.gridPrice, boundaryValuePerKWh);
const aboveBoundary = costHelpers.calculateSocAdjustedCost(aboveBoundaryResult, config.gridPrice, boundaryValuePerKWh);
const belowBoundaryDisplay = costHelpers.formatCostLine(belowBoundaryResult, 'USD', config.gridPrice, boundaryValuePerKWh);
const aboveBoundaryDisplay = costHelpers.formatCostLine(aboveBoundaryResult, 'USD', config.gridPrice, boundaryValuePerKWh);
assert.ok(belowBoundary.adjustmentShare < SOC_COMPARABILITY_THRESHOLD, 'just-below boundary remains comparable');
assert.ok(aboveBoundary.adjustmentShare > SOC_COMPARABILITY_THRESHOLD, 'just-above boundary becomes non-comparable');
assert.notEqual(belowBoundaryDisplay.primary, 'Не сопоставимо', 'just-below boundary shows plain cost');
assert.equal(aboveBoundaryDisplay.primary, 'Не сопоставимо', 'just-above boundary shows non-comparable label');
assert.equal(belowBoundaryDisplay.secondary, `SOC-корр.: USD 99${nbsp}900 (−USD 100)`, 'just-below boundary still shows the adjusted line');
assert.equal(aboveBoundaryDisplay.secondary, `SOC-корр.: USD 99${nbsp}900 (−USD 100)`, 'just-above boundary shows the adjusted line');
const realisticConfig = { ...config, bessPowerKW: 1000, bessEnergyKWh: 2000, initialSocPercent: 50, reserveSocPercent: 10 };
const realisticResult = hybrid.simulateHybridScenario(rows, scenarios.find(item => item.name === 'ГПУ + BESS'), realisticConfig);
const realisticAdjusted = costHelpers.calculateSocAdjustedCost(realisticResult, realisticConfig.gridPrice, realisticConfig.fuelPrice);
const realisticDisplay = costHelpers.formatCostLine(realisticResult, 'USD', realisticConfig.gridPrice, realisticConfig.fuelPrice);
assert.equal(realisticAdjusted.comparable, true, 'realistic 2 MWh scenario stays below 0.1%');
assert.ok(realisticAdjusted.adjustmentShare < SOC_COMPARABILITY_THRESHOLD, 'realistic scenario does not trigger the threshold label');
assert.notEqual(realisticDisplay.primary, 'Не сопоставимо', 'realistic scenario keeps plain cost visible');
approx(gasBess.endSocKWh, 569, 0.11, 'final SOC kWh');
approx(gasBess.endSocPercent, 56.9, 0.02, 'final SOC percent');
approx(gasBess.usableEnergyRemainingKWh, 469, 0.11, 'remaining usable energy kWh');
const numericKeys = [
  'gridImportKWh','gasGenerationKWh','pvUsedKWh','pvCurtailmentKWh','bessChargeKWh',
  'bessDischargeKWh','unservedKWh','fuelQuantity','cost','startSocKWh','endSocKWh',
  'startSocPercent','endSocPercent','usableEnergyRemainingKWh','balanceResidualKWh',
  'socClosed','costComparable','costComparisonNote',
];
for (const key of numericKeys) {
  assert.deepEqual(gasPvBess[key], gasBess[key], `PV=0 scenario matches gas+BESS for ${key}`);
  assert.deepEqual(gridGasPvBess[key], gasBess[key], `PV=0 grid+gas+BESS scenario matches for ${key}`);
}
console.log(`Golden SOC adjustment: delta=${socAdjusted.deltaSocKWh.toFixed(6)} kWh; value=${socAdjusted.valuePerKWh.toFixed(9)} / kWh; cost=${gasBess.cost.toFixed(6)}; adjusted=${socAdjusted.adjustedCost.toFixed(6)}; adjustment=${socAdjusted.adjustment.toFixed(6)}; share=${(socAdjusted.adjustmentShare * 100).toFixed(9)}%.`);
console.log(`20 MWh case: end SOC=${thresholdResult.endSocKWh.toFixed(6)} kWh; delta=${thresholdAdjusted.deltaSocKWh.toFixed(6)} kWh; cost=${thresholdResult.cost.toFixed(6)}; adjusted=${thresholdAdjusted.adjustedCost.toFixed(6)}; adjustment=${thresholdAdjusted.adjustment.toFixed(6)}; share=${(thresholdAdjusted.adjustmentShare * 100).toFixed(6)}%; displayed="${thresholdDisplay.primary}" / "${thresholdDisplay.secondary}".`);
console.log(`Boundary below: ΔSOC=${belowBoundary.deltaSocKWh.toFixed(6)} kWh; adjusted=${belowBoundary.adjustedCost.toFixed(6)}; share=${(belowBoundary.adjustmentShare * 100).toFixed(6)}%; label="${belowBoundaryDisplay.primary}". Above: ΔSOC=${aboveBoundary.deltaSocKWh.toFixed(6)} kWh; adjusted=${aboveBoundary.adjustedCost.toFixed(6)}; share=${(aboveBoundary.adjustmentShare * 100).toFixed(6)}%; label="${aboveBoundaryDisplay.primary}".`);
console.log(`Realistic 2 MWh case: end SOC=${realisticResult.endSocKWh.toFixed(6)} kWh; delta=${realisticAdjusted.deltaSocKWh.toFixed(6)} kWh; cost=${realisticResult.cost.toFixed(6)}; adjusted=${realisticAdjusted.adjustedCost.toFixed(6)}; adjustment=${realisticAdjusted.adjustment.toFixed(6)}; share=${(realisticAdjusted.adjustmentShare * 100).toFixed(6)}%; displayed="${realisticDisplay.primary}" / "${realisticDisplay.secondary}".`);
console.log('Hybrid page regression passed: model, display-format, SOC-adjustment and zero-PV assertions.')
