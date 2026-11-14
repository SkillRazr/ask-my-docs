import { randomUUID } from "node:crypto";
import { pool } from "../db/pool";
import { embed } from "./embedding.service";

export async function saveChunks(documentId: string, chunks: string[], metadata = {}) {
  const vectors = await embed(chunks); // one API call for many chunks
  for (let i = 0; i < chunks.length; i++) {
    await pool.query(
      `INSERT INTO document_chunks (id, document_id, content, embedding, metadata)
       VALUES ($1, $2, $3, $4::vector, $5)`,
      [randomUUID(), documentId, chunks[i], JSON.stringify(vectors[i]), metadata]
    );
  }
}
