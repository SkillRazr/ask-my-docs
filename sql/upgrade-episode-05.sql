-- Episode 5: conversations, long-term memory and agent runs.
-- Safe to run more than once.

-- A conversation, and a running summary of its older messages.
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_key TEXT NOT NULL,            -- who is talking; a signed-in user from episode 7
    summary TEXT NOT NULL DEFAULT '',  -- older messages, summarised to save tokens
    summarized_up_to BIGINT NOT NULL DEFAULT 0,  -- the last message id in the summary
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Short-term memory: every message in a conversation.
CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    role TEXT NOT NULL,                -- user or assistant
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, id);

-- Long-term memory: facts about a user, found again by meaning.
CREATE TABLE IF NOT EXISTS memories (
    id BIGSERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_key TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS memories_user_idx ON memories (tenant_id, user_key);

-- One row per agent run: how it ended, how many steps it took and what it cost.
CREATE TABLE IF NOT EXISTS agent_runs (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    stop_reason TEXT NOT NULL,         -- answered, max_steps, repeated_call, error
    steps INT NOT NULL,
    tools_used TEXT[] NOT NULL DEFAULT '{}',
    latency_ms INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
