-- Data retention: auto-cleanup events older than 90 days
-- This index speeds up the DELETE query
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events (created_at);

-- For alert_rules: track when alerts were last triggered
CREATE INDEX IF NOT EXISTS idx_alert_rules_user ON alert_rules (user_id, pipeline_id);
