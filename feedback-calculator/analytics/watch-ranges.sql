-- Installed electric capacity, MW. Prices in the reported tariff unit. Lower bound inclusive.
SELECT power_mw, gas_unit, gas_band, count(*) AS calculations, count(DISTINCT sid) AS sessions
FROM calculator_events
WHERE is_test=0 AND hour_utc=CAST(unixepoch()/3600 AS INTEGER)-1 AND ordinal BETWEEN 2 AND 33
GROUP BY power_mw,gas_unit,gas_band ORDER BY calculations DESC,power_mw,gas_unit,gas_band;
