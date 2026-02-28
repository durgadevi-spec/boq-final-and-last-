-- 0006_alerts.sql - create alerts table for system notifications

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  material_id VARCHAR(100),
  name TEXT,
  old_rate NUMERIC,
  new_rate NUMERIC,
  edited_by TEXT,
  shop_id VARCHAR(100),
  shop_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts (created_at);
