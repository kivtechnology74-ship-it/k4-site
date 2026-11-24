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
assert.ok(costHelper && costDisplayHelper, 'page exposes display-only SOC cost adjustment helpers');
const costHelpers = vm.runInNewContext(`${costHelper[0]}\n${costDisplayHelper[0]}\n({calculateSocAdjustedCost,formatCostLine})`, { fmt: format });
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
assert.equal(socAdjusted.comparable, true, 'golden gas + BESS cost is comparable below the 0.5% threshold');
approx(socAdjusted.deltaSocKWh, 69, 0.11, 'golden SOC delta kWh');
approx(socAdjusted.valuePerKWh, gasBess.fuelQuantity * config.fuelPrice / gasBess.gasGenerationKWh, 1e-12, 'marginal gas cost per kWh');
approx(socAdjusted.adjustedCost, gasBess.cost - socAdjusted.deltaSocKWh * socAdjusted.valuePerKWh, 1e-8, 'SOC-adjusted cost formula');
assert.ok(socAdjusted.adjustmentShare < 0.005, 'golden adjustment share is below 0.5%');
const goldenCostDisplay = costHelpers.formatCostLine(gasBess, 'USD', config.gridPrice, config.fuelPrice);
assert.equal(goldenCostDisplay.primary, `USD ${format(gasBess.cost, 0)}`, 'golden plain cost remains visible as comparable');
assert.match(goldenCostDisplay.secondary, /^SOC-корр\.: USD /, 'golden adjusted cost appears on a second line');
const gridAdjusted = costHelpers.calculateSocAdjustedCost(grid, config.gridPrice, config.fuelPrice);
assert.equal(gridAdjusted.valuePerKWh, config.gridPrice, 'grid price is the fallback when no gas generation is present');
assert.equal(gridAdjusted.comparable, true, 'grid-only scenario with unchanged SOC is comparable');
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
console.log('Hybrid page regression passed: model, display-format, SOC-adjustment and zero-PV assertions.')
