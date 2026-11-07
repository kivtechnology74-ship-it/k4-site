CREATE TABLE IF NOT EXISTS diagnostic_requests (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  contact TEXT NOT NULL,
  fault_description TEXT NOT NULL,
  engine_model TEXT,
  alarm_code TEXT,
  site_country TEXT,
  language TEXT NOT NULL,
  source_url TEXT,
  cf_country TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  email_status TEXT NOT NULL DEFAULT 'pending',
  email_message_id TEXT,
  email_error TEXT,
  updated_at TEXT NOT NULL,
  details_json TEXT,
  attribution_json TEXT,
  safety_ack INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_requests_created_at
  ON diagnostic_requests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_diagnostic_requests_email_status
  ON diagnostic_requests(email_status, created_at);
