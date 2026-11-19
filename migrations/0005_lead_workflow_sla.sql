ALTER TABLE site_leads ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'NEW'
  CHECK (workflow_status IN ('NEW','ACKNOWLEDGED','CONTACTED','QUALIFIED','PROPOSAL','WON','LOST','SPAM','TEST'));
ALTER TABLE site_leads ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0,1));
ALTER TABLE site_leads ADD COLUMN acknowledged_by TEXT;
ALTER TABLE site_leads ADD COLUMN acknowledged_at TEXT;
ALTER TABLE site_leads ADD COLUMN sla_started_at TEXT;

CREATE INDEX IF NOT EXISTS site_leads_workflow_sla
  ON site_leads(workflow_status, is_test, sla_started_at);

CREATE TABLE IF NOT EXISTS lead_workflow_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT NOT NULL REFERENCES site_leads(id),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS lead_workflow_events_lead
  ON lead_workflow_events(lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lead_sla_notifications (
  lead_id TEXT NOT NULL REFERENCES site_leads(id),
  stage TEXT NOT NULL CHECK (stage IN ('15m','2h','24h')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (lead_id, stage)
);
CREATE INDEX IF NOT EXISTS lead_sla_notifications_status
  ON lead_sla_notifications(status, updated_at);
