-- Episode 8: the gateway. Spend per user, guardrail events, rate limits and
-- documents held back for review. Safe to run more than once.

-- Who made each LLM call, so each user can have a daily budget.
ALTER TABLE llm_usage ADD COLUMN IF NOT EXISTS user_key TEXT;
CREATE INDEX IF NOT EXISTS llm_usage_user_idx ON llm_usage (user_key, created_at);

-- Every time a guardrail or policy stepped in: what happened, never the raw content.
CREATE TABLE IF NOT EXISTS guardrail_events (
    id BIGSERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_key TEXT,
    kind TEXT NOT NULL,     -- rate_limited, over_budget, injection_blocked, pii_redacted,
                            -- policy_denied, output_redacted, output_blocked, quarantined
    detail TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS guardrail_events_idx ON guardrail_events (tenant_id, created_at);

-- Requests per user per minute: one row per user and minute.
CREATE TABLE IF NOT EXISTS rate_limits (
    user_key TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_key, window_start)
);

-- A document that looked like a prompt injection waits for a person to review it.
ALTER TABLE ingestion_jobs ADD COLUMN IF NOT EXISTS reviewed BOOLEAN NOT NULL DEFAULT false;
