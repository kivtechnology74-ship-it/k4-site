CREATE TABLE IF NOT EXISTS calculator_completions (
  calc_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  brand TEXT NOT NULL,
  model_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  profile_type TEXT NOT NULL CHECK (profile_type IN ('oem', 'incomplete', 'manual')),
  language TEXT NOT NULL CHECK (language IN ('ru', 'en')),
  calculator_version TEXT NOT NULL,
  page_path TEXT NOT NULL,
  traffic_class TEXT NOT NULL CHECK (traffic_class IN ('production', 'qa', 'probable_automation'))
);

CREATE TABLE IF NOT EXISTS calculator_events (
  event_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  event_name TEXT NOT NULL CHECK (event_name IN (
    'calculator_page_view', 'calculator_started', 'calculator_model_selected',
    'calculator_result_completed', 'calculator_pdf_clicked',
    'calculator_contact_clicked', 'generate_lead'
  )),
  session_id TEXT NOT NULL,
  calc_id TEXT NOT NULL,
  brand TEXT NOT NULL,
  model_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  profile_type TEXT NOT NULL CHECK (profile_type IN ('oem', 'incomplete', 'manual', 'demo')),
  language TEXT NOT NULL CHECK (language IN ('ru', 'en')),
  calculator_version TEXT NOT NULL,
  page_path TEXT NOT NULL,
  traffic_class TEXT NOT NULL CHECK (traffic_class IN ('production', 'qa', 'demo', 'probable_automation'))
);

CREATE INDEX IF NOT EXISTS calculator_events_funnel
  ON calculator_events(traffic_class, created_at, event_name);
CREATE INDEX IF NOT EXISTS calculator_events_model
  ON calculator_events(traffic_class, created_at, model_id, event_name);

ALTER TABLE site_leads ADD COLUMN calc_id TEXT REFERENCES calculator_completions(calc_id);
ALTER TABLE site_leads ADD COLUMN qualification_status TEXT NOT NULL DEFAULT 'unreviewed'
  CHECK (qualification_status IN ('unreviewed', 'qualified', 'disqualified'));
CREATE INDEX IF NOT EXISTS site_leads_calc_id ON site_leads(calc_id);
