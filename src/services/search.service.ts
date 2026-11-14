import { pool } from "../db/pool";
import { embed } from "./embedding.service";

export async function search(query: string, limit = 5) {
  const [queryVector] = await embed([query]);
  const { rows } = await pool.query(
    `SELECT id, content, metadata,
            1 - (embedding <=> $1::vector) AS similarity
     FROM document_chunks
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [JSON.stringify(queryVector), limit]
  );
  return rows;
}
