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

CREATE INDEX IF NOT EXISTS site_leads_pending_email
  ON site_leads(email_status, next_attempt_at);

CREATE TABLE IF NOT EXISTS lead_rate_limits (
  id TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
