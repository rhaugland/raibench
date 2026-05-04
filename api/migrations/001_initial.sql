CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_id BIGINT UNIQUE NOT NULL,
    github_username TEXT NOT NULL,
    email TEXT,
    api_key TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE events (
    id UUID DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    pipeline_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    provider TEXT,
    model TEXT,
    latency_ms INTEGER NOT NULL,
    token_count INTEGER,
    cost_cents NUMERIC(10, 4),
    success BOOLEAN NOT NULL,
    task_category TEXT,
    retrieval_chunks INTEGER,
    retrieval_score_avg NUMERIC(5, 4),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_hypertable('events', 'created_at');

CREATE INDEX idx_events_user_pipeline ON events (user_id, pipeline_id, created_at DESC);
CREATE INDEX idx_events_user_category ON events (user_id, task_category, created_at DESC);
CREATE INDEX idx_events_pipeline_stage ON events (pipeline_id, stage, created_at DESC);
CREATE INDEX idx_users_api_key ON users (api_key);
