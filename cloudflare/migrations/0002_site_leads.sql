CREATE TABLE IF NOT EXISTS site_leads (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  language TEXT NOT NULL,
  form_type TEXT NOT NULL,
  contact TEXT NOT NULL,
  message TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '[]',
  source_url TEXT NOT NULL,
  timezone TEXT,
  attribution_json TEXT NOT NULL DEFAULT '{}',
  safety_ack INTEGER NOT NULL DEFAULT 0,
  email_status TEXT NOT NULL DEFAULT 'pending',
  email_attempts INTEGER NOT NULL DEFAULT 0,
  email_error TEXT,
  next_attempt_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS site_leads_delivery_retry
  ON site_leads(next_attempt_at, email_status);

CREATE INDEX IF NOT EXISTS site_leads_created_at
  ON site_leads(created_at);

ALTER TABLE diagnostic_requests
  ADD COLUMN email_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE diagnostic_requests
  ADD COLUMN email_next_attempt_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
