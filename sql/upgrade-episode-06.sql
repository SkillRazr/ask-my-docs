-- Episode 6: thumbs up or down on answers, from the web UI.
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS feedback (
    id BIGSERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_key TEXT NOT NULL,
    mode TEXT NOT NULL,                -- ask (the quick answer) or agent
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    rating SMALLINT NOT NULL CHECK (rating IN (-1, 1)),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS feedback_tenant_idx ON feedback (tenant_id, created_at);
