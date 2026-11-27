CREATE TABLE IF NOT EXISTS calculator_events (
  sid TEXT NOT NULL CHECK(length(sid) = 36),
  is_test INTEGER NOT NULL CHECK(is_test IN (0,1)),
  ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 0 AND 33 OR ordinal = 40),
  hour_utc INTEGER NOT NULL,
  slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 360),
  power_mw TEXT,
  gas_unit TEXT,
  gas_band TEXT,
  PRIMARY KEY (sid, is_test, ordinal),
  UNIQUE (is_test, hour_utc, slot),
  CHECK ((ordinal BETWEEN 2 AND 33 AND power_mw IS NOT NULL AND gas_unit IS NOT NULL AND gas_band IS NOT NULL)
    OR ((ordinal < 2 OR ordinal = 40) AND power_mw IS NULL AND gas_unit IS NULL AND gas_band IS NULL))
) WITHOUT ROWID;

CREATE TRIGGER IF NOT EXISTS calculator_expire AFTER INSERT ON calculator_events
BEGIN
  DELETE FROM calculator_events WHERE (sid, is_test, ordinal) IN (
    SELECT sid, is_test, ordinal FROM calculator_events
    WHERE is_test = NEW.is_test AND hour_utc < NEW.hour_utc - 720
    ORDER BY hour_utc LIMIT 8
  );
END;
