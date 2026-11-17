ALTER TABLE site_leads ADD COLUMN telegram_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE site_leads ADD COLUMN telegram_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE site_leads ADD COLUMN telegram_error TEXT;
