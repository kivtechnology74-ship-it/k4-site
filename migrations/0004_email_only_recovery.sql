ALTER TABLE lead_notification_jobs ADD COLUMN callback_url TEXT;
ALTER TABLE lead_notification_jobs ADD COLUMN last_enqueued_at TEXT;
ALTER TABLE lead_notification_jobs ADD COLUMN failure_reason TEXT;

CREATE INDEX IF NOT EXISTS lead_notification_jobs_recovery
  ON lead_notification_jobs(status, last_enqueued_at, updated_at);
