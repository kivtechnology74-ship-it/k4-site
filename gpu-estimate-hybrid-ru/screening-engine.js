'use strict';

// Free Power Screening: deterministic annual energy and grid-capacity arithmetic.
// This intentionally does not call the gas-engine or hybrid dispatch model.
(function (root) {
  const HOURS_PER_YEAR = 8760;

  function calculateScreening(input) {
    const powerMW = Number(input.requiredPowerMW);
    const utilizationPercent = Number(input.utilizationPercent);
    const pue = input.loadType === 'it' ? Number(input.pue) : 1;
    if (!Number.isFinite(powerMW) || powerMW <= 0) throw new Error('Введите требуемую мощность больше нуля.');
    if (!['it', 'facility'].includes(input.loadType)) throw new Error('Выберите IT Load или Total Facility Load.');
    if (input.loadType === 'it' && (!Number.isFinite(pue) || pue < 1)) throw new Error('Для IT Load укажите PUE не меньше 1.');
    if (!Number.isFinite(utilizationPercent) || utilizationPercent < 0 || utilizationPercent > 100) throw new Error('Загрузка должна быть от 0 до 100%.');

    const facilityPeakMW = powerMW * pue;
    const equivalentFullLoadHours = HOURS_PER_YEAR * utilizationPercent / 100;
    const annualEnergyMWh = facilityPeakMW * equivalentFullLoadHours;
    const averageLoadMW = annualEnergyMWh / HOURS_PER_YEAR;
    const tariff = input.gridTariff === '' || input.gridTariff == null ? null : Number(input.gridTariff);
    if (tariff !== null && (!Number.isFinite(tariff) || tariff < 0)) throw new Error('Тариф сети должен быть числом не меньше нуля.');
    const annualEnergyCost = tariff === null ? null : annualEnergyMWh * 1000 * tariff;

    const capacity = input.gridCapacityMW === '' || input.gridCapacityMW == null ? null : Number(input.gridCapacityMW);
    if (capacity !== null && (!Number.isFinite(capacity) || capacity < 0)) throw new Error('Доступная мощность сети должна быть числом не меньше нуля.');
    const gridCheck = capacity === null ? 'unknown' : capacity >= facilityPeakMW ? 'sufficient' : 'shortfall';
    const gridShortfallMW = capacity === null ? null : Math.max(0, facilityPeakMW - capacity);
    const connectionDate = String(input.connectionDate || '').trim() || null;

    return {
      loadType: input.loadType, enteredPowerMW: powerMW, pue, facilityPeakMW,
      utilizationPercent, equivalentFullLoadHours, annualEnergyMWh, averageLoadMW,
      gridTariff: tariff, currency: String(input.currency || '').trim().toUpperCase() || null,
      annualEnergyCost, gridCapacityMW: capacity, gridCheck, gridShortfallMW,
      connectionDate, scenarioAssumption: input.utilizationIsScenario === true
    };
  }

  const api = { HOURS_PER_YEAR, calculateScreening };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.K4Screening = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
