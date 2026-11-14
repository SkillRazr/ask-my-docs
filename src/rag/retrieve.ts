import { pool } from "../db/pool";
import { embed } from "../services/embedding.service";

export interface RetrievedChunk {
  id: string;
  title: string;
  content: string;
  similarity: number;
}

// Below this, a chunk is probably not about the question. Tune it on your own data.
const MIN_SIMILARITY = 0.3;

export async function retrieve(question: string, limit = 5): Promise<RetrievedChunk[]> {
  const [vector] = await embed([question]);
  const { rows } = await pool.query(
    `SELECT id, content,
            COALESCE(metadata->>'title', 'Untitled') AS title,
            1 - (embedding <=> $1::vector) AS similarity
     FROM document_chunks
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [JSON.stringify(vector), limit]
  );
  return rows
    .map((row) => ({ ...row, similarity: Number(row.similarity) }))
    .filter((chunk) => chunk.similarity >= MIN_SIMILARITY);
}
