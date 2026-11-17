CREATE TABLE IF NOT EXISTS lead_notification_jobs (
  lead_id TEXT PRIMARY KEY REFERENCES site_leads(id) ON DELETE CASCADE,
  dispatch_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS lead_notification_jobs_pending
  ON lead_notification_jobs(status, updated_at);
