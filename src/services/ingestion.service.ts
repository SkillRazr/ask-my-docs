import { createHash, randomUUID } from "node:crypto";
import { pool } from "../db/pool";
import { embed } from "./embedding.service";
import { chunkMarkdown } from "./chunking.service";

export async function saveChunks(
  documentId: string,
  chunks: string[],
  metadata: Record<string, unknown> = {},
  tenantId = "default"
) {
  const vectors = await embed(chunks); // one API call for many chunks
  for (let i = 0; i < chunks.length; i++) {
    await pool.query(
      `INSERT INTO document_chunks (id, document_id, content, embedding, metadata, tenant_id)
       VALUES ($1, $2, $3, $4::vector, $5, $6)`,
      [randomUUID(), documentId, chunks[i], JSON.stringify(vectors[i]), metadata, tenantId]
    );
  }
}

// Replaces one document's chunks in a single transaction, so a search never sees
// half-indexed text. Skips documents whose content hasn't changed, which saves
// embedding calls. Returns the number of chunks saved (0 when unchanged).
export async function replaceDocument(tenantId: string, title: string, text: string, source: string) {
  const hash = createHash("sha256").update(text).digest("hex");
  const existing = await pool.query(
    `SELECT 1 FROM document_chunks
     WHERE tenant_id = $1 AND metadata->>'title' = $2 AND metadata->>'hash' = $3 LIMIT 1`,
    [tenantId, title, hash]
  );
  if (existing.rowCount) return 0;

  const chunks = chunkMarkdown(text, title);
  const vectors = await embed(chunks); // before the transaction: API calls are slow
  const documentId = randomUUID();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM document_chunks WHERE tenant_id = $1 AND metadata->>'title' = $2`,
      [tenantId, title]
    );
    for (let i = 0; i < chunks.length; i++) {
      await client.query(
        `INSERT INTO document_chunks (id, document_id, content, embedding, metadata, tenant_id)
         VALUES ($1, $2, $3, $4::vector, $5, $6)`,
        [randomUUID(), documentId, chunks[i], JSON.stringify(vectors[i]), { title, source, hash }, tenantId]
      );
    }
    await client.query("COMMIT");
    return chunks.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
