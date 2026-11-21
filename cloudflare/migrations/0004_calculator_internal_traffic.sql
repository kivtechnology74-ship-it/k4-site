ALTER TABLE calculator_events ADD COLUMN internal_traffic INTEGER NOT NULL DEFAULT 0
  CHECK (internal_traffic IN (0, 1));

ALTER TABLE calculator_completions ADD COLUMN internal_traffic INTEGER NOT NULL DEFAULT 0
  CHECK (internal_traffic IN (0, 1));

CREATE INDEX IF NOT EXISTS calculator_events_internal_funnel
  ON calculator_events(traffic_class, internal_traffic, created_at, event_name);
