-- Episode 12: governance. An audit trail, and which prompt version produced what.

-- Who did what, when. One row per action that matters: sign-ins, role changes,
-- approvals, data exports and erasures, retention runs. Never the content itself.
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tenant_id TEXT NOT NULL,
    actor TEXT NOT NULL,               -- a user id, or "cli" or "system"
    action TEXT NOT NULL,              -- for example user.signed_in, action.approved
    target TEXT,                       -- what it was done to: an email, an action id
    details JSONB NOT NULL DEFAULT '{}',
    trace_id TEXT                      -- links the entry to its trace (episode 9)
);
CREATE INDEX IF NOT EXISTS audit_log_tenant_idx ON audit_log (tenant_id, at DESC);

-- An audit trail you can edit isn't evidence. The database refuses changes, and
-- deletes of anything younger than a year, whatever the app's code does.
CREATE OR REPLACE FUNCTION audit_log_protect() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'audit_log is append-only';
    END IF;
    IF OLD.at > NOW() - INTERVAL '365 days' THEN
        RAISE EXCEPTION 'audit entries are kept for 365 days';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_protect ON audit_log;
CREATE TRIGGER audit_log_protect BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_protect();

-- Which version of a prompt each LLM call and agent run used, so a change in
-- quality can be traced to the prompt change that caused it.
ALTER TABLE llm_usage ADD COLUMN IF NOT EXISTS prompt_version TEXT;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS prompt_version TEXT;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS model TEXT;
