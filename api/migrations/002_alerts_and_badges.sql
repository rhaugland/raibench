CREATE TABLE alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    pipeline_id TEXT NOT NULL,
    webhook_url TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'slack',  -- 'slack' or 'discord'
    metric TEXT NOT NULL,  -- 'success_rate', 'p50_latency_ms', 'daily_cost_cents'
    operator TEXT NOT NULL DEFAULT 'lt',  -- 'lt', 'gt'
    threshold NUMERIC NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_rules_user ON alert_rules (user_id, pipeline_id);

-- Badges: public access token per pipeline
ALTER TABLE users ADD COLUMN IF NOT EXISTS badge_token TEXT UNIQUE;
