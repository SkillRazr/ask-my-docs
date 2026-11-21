-- Episode 3: multi-tenancy, keyword search, an ingestion queue, a cache and a database source.
-- Safe to run more than once.

-- Every chunk belongs to one tenant (a customer, team or workspace).
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS document_chunks_tenant_idx ON document_chunks (tenant_id);

-- Full-text search for hybrid retrieval. Postgres keeps this column up to date itself.
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS content_tsv TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX IF NOT EXISTS document_chunks_tsv_idx ON document_chunks USING GIN (content_tsv);

-- Documents waiting to be indexed. A worker picks them up one at a time.
CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id BIGSERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    title TEXT NOT NULL,
    source TEXT NOT NULL,              -- 'file' or 'database'
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued', -- queued, running, done, failed
    attempts INT NOT NULL DEFAULT 0,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ingestion_jobs_status_idx ON ingestion_jobs (status, id);

-- Answers to repeated questions, so they cost no LLM call.
CREATE TABLE IF NOT EXISTS answer_cache (
    tenant_id TEXT NOT NULL,
    question_key TEXT NOT NULL,
    answer JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, question_key)
);

-- A second kind of source: rows in a business table, here a small FAQ.
CREATE TABLE IF NOT EXISTS faqs (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO faqs (id, question, answer) VALUES
  (1, 'What is the notice period when resigning?', 'The notice period is 30 days for everyone, including interns.'),
  (2, 'Can I get my salary advance?', 'Yes. You can request one salary advance per year in the finance portal, up to 50% of your monthly salary.'),
  (3, 'When is salary paid?', 'Salary is paid on the last working day of every month.')
ON CONFLICT (id) DO NOTHING;
