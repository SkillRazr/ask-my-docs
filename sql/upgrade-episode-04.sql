-- Episode 4: what every LLM call cost, and what every tool call did.
-- Safe to run more than once.

-- One row per LLM or embedding call.
CREATE TABLE IF NOT EXISTS llm_usage (
    id BIGSERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    purpose TEXT NOT NULL,          -- answer, rewrite, rerank, judge, embed, assistant
    model TEXT NOT NULL,
    input_tokens INT NOT NULL,
    output_tokens INT NOT NULL,
    cost_usd NUMERIC(12, 6) NOT NULL,
    latency_ms INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS llm_usage_tenant_time_idx ON llm_usage (tenant_id, created_at);

-- One row per tool call, from the MCP server or the assistant.
CREATE TABLE IF NOT EXISTS tool_calls (
    id BIGSERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    tool TEXT NOT NULL,
    caller TEXT NOT NULL,           -- mcp-stdio, mcp-http or assistant
    arguments JSONB NOT NULL,
    ok BOOLEAN NOT NULL,
    error TEXT,
    latency_ms INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tool_calls_tenant_time_idx ON tool_calls (tenant_id, created_at);
