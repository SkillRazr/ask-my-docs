import { pool } from "../db/pool";
import { embed } from "../services/embedding.service";

export interface RetrievedChunk {
  id: string;
  title: string;
  content: string;
  similarity: number;
}

// Reciprocal Rank Fusion, from episode 1: merges ranked lists of ids.
function reciprocalRankFusion(lists: string[][], k = 60) {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

// Hybrid retrieval: vector search finds meaning, keyword search finds exact terms
// (error codes, names, numbers). Both only ever look at this tenant's chunks.
export async function retrieve(question: string, tenantId: string, limit = 20): Promise<RetrievedChunk[]> {
  const [vector] = await embed([question]);

  const semantic = await pool.query(
    `SELECT id, content, COALESCE(metadata->>'title', 'Untitled') AS title,
            1 - (embedding <=> $1::vector) AS similarity
     FROM document_chunks
     WHERE tenant_id = $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [JSON.stringify(vector), tenantId, limit]
  );

  const keyword = await pool.query(
    `SELECT id, content, COALESCE(metadata->>'title', 'Untitled') AS title, 0 AS similarity
     FROM document_chunks
     WHERE tenant_id = $2 AND content_tsv @@ websearch_to_tsquery('english', $1)
     ORDER BY ts_rank(content_tsv, websearch_to_tsquery('english', $1)) DESC
     LIMIT $3`,
    [question, tenantId, limit]
  );

  const byId = new Map<string, RetrievedChunk>();
  for (const row of [...keyword.rows, ...semantic.rows]) {
    byId.set(row.id, { ...row, similarity: Number(row.similarity) });
  }
  const merged = reciprocalRankFusion([
    semantic.rows.map((row) => row.id),
    keyword.rows.map((row) => row.id),
  ]);
  return merged.slice(0, limit).map((id) => byId.get(id)!);
}
