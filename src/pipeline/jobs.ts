import { pool } from "../db/pool";

export interface IngestionJob {
  id: number;
  tenant_id: string;
  title: string;
  source: string;
  content: string;
  attempts: number;
}

export async function enqueue(tenantId: string, title: string, source: string, content: string) {
  await pool.query(
    `INSERT INTO ingestion_jobs (tenant_id, title, source, content) VALUES ($1, $2, $3, $4)`,
    [tenantId, title, source, content]
  );
}

// Claims the oldest queued job. SKIP LOCKED lets several workers run side by side
// without two of them picking the same job.
export async function claimNext(): Promise<IngestionJob | null> {
  const { rows } = await pool.query(
    `UPDATE ingestion_jobs SET status = 'running', attempts = attempts + 1, updated_at = NOW()
     WHERE id = (
       SELECT id FROM ingestion_jobs WHERE status = 'queued'
       ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
     )
     RETURNING id, tenant_id, title, source, content, attempts`
  );
  return rows[0] ?? null;
}

export async function finish(id: number) {
  await pool.query(`UPDATE ingestion_jobs SET status = 'done', error = NULL, updated_at = NOW() WHERE id = $1`, [id]);
}

// Puts a failed job back in the queue, up to 3 attempts, then marks it failed for a person to look at.
export async function fail(job: IngestionJob, error: unknown) {
  const status = job.attempts >= 3 ? "failed" : "queued";
  await pool.query(
    `UPDATE ingestion_jobs SET status = $2, error = $3, updated_at = NOW() WHERE id = $1`,
    [job.id, status, String(error)]
  );
}
