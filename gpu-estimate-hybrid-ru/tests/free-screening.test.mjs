import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const { calculateScreening } = require(resolve(here, '../screening-engine.js'));
const base = overrides => ({ requiredPowerMW: 10, loadType: 'it', pue: 1.3, utilizationPercent: 70, gridTariff: '0.10', currency: 'USD', gridCapacityMW: '', connectionDate: '', ...overrides });

test('IT Load converts through user PUE and calculates annual energy and bill', () => {
  const r = calculateScreening(base({ utilizationIsScenario: true }));
  assert.equal(r.facilityPeakMW, 13);
  assert.equal(r.equivalentFullLoadHours, 6132);
  assert.equal(r.annualEnergyMWh, 79716);
  assert.equal(r.averageLoadMW, 9.1);
  assert.equal(r.annualEnergyCost, 7971600);
  assert.equal(r.scenarioAssumption, true);
});

test('Total Facility Load uses the entered value without PUE multiplication', () => {
  const r = calculateScreening(base({ loadType: 'facility', requiredPowerMW: 10, pue: 2.4, utilizationPercent: 100 }));
  assert.equal(r.facilityPeakMW, 10);
  assert.equal(r.annualEnergyMWh, 87600);
  assert.equal(r.averageLoadMW, 10);
  assert.equal(r.equivalentFullLoadHours, 8760);
});

test('utilization sensitivity changes annual MWh and preserves peak capacity check', () => {
  const half = calculateScreening(base({ loadType: 'facility', utilizationPercent: 50, gridCapacityMW: 9 }));
  const seventy = calculateScreening(base({ loadType: 'facility', utilizationPercent: 70, gridCapacityMW: 9 }));
  assert.equal(half.annualEnergyMWh, 43800);
  assert.equal(seventy.annualEnergyMWh, 61320);
  assert.equal(half.gridCheck, 'shortfall');
  assert.equal(half.gridShortfallMW, 1);
});

test('network capacity sufficient, shortfall, and unknown are distinct', () => {
  assert.equal(calculateScreening(base({ gridCapacityMW: 13 })).gridCheck, 'sufficient');
  const gap = calculateScreening(base({ gridCapacityMW: 12 }));
  assert.equal(gap.gridCheck, 'shortfall');
  assert.equal(gap.gridShortfallMW, 1);
  assert.equal(calculateScreening(base()).gridCheck, 'unknown');
});

test('unknown tariff does not fabricate annual cost; explicitly entered zero is valid', () => {
  assert.equal(calculateScreening(base({ gridTariff: '' })).annualEnergyCost, null);
  assert.equal(calculateScreening(base({ gridTariff: 0 })).annualEnergyCost, 0);
  assert.throws(() => calculateScreening(base({ gridTariff: -0.1 })), /Тариф сети/);
});

test('optional connection date is passed through without valuation', () => {
  const r = calculateScreening(base({ connectionDate: '2028-06-01' }));
  assert.equal(r.connectionDate, '2028-06-01');
  assert.equal(Object.hasOwn(r, 'earlyConnectionValue'), false);
});

test('invalid power, PUE, utilization, and capacity are rejected', () => {
  assert.throws(() => calculateScreening(base({ requiredPowerMW: 0 })), /мощность/);
  assert.throws(() => calculateScreening(base({ pue: 0.99 })), /PUE/);
  assert.throws(() => calculateScreening(base({ utilizationPercent: 100.1 })), /[Зз]агрузка/);
  assert.throws(() => calculateScreening(base({ gridCapacityMW: -1 })), /мощность сети/);
});

test('zero utilization produces zero energy, average load, and energy cost', () => {
  const r = calculateScreening(base({ utilizationPercent: 0 }));
  assert.equal(r.annualEnergyMWh, 0);
  assert.equal(r.averageLoadMW, 0);
  assert.equal(r.annualEnergyCost, 0);
});
