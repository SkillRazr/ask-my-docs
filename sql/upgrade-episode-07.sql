-- Episode 7: users with roles, and actions waiting for a person's approval.
-- Safe to run more than once.

-- Invited users. Google proves who someone is; this table says what they may do.
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,        -- always stored in lower case
    tenant_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('viewer', 'editor', 'admin')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- A change the agent wants to make, held until the user approves or rejects it.
CREATE TABLE IF NOT EXISTS pending_actions (
    id UUID PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations (id) ON DELETE CASCADE,
    tool TEXT NOT NULL,
    arguments JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, approved, rejected, expired
    result TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    decided_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS pending_actions_user_idx ON pending_actions (user_id, status);
