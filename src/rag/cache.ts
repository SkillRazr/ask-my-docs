import { createHash } from "node:crypto";
import { pool } from "../db/pool";
import type { RagAnswer } from "./answer";
import { prompt } from "../prompts";
import { ANSWER_MODEL } from "../services/llm";

const MAX_AGE_MINUTES = 60;

// "How many leave days?" and "how many leave days" are the same question. The
// prompt versions and the model are part of the key (episode 12), so a new prompt
// or model never serves answers written by the old one.
const keyFor = (question: string) =>
  createHash("sha256")
    .update(
      [
        prompt("answer").version,
        prompt("answer-stream").version,
        ANSWER_MODEL,
        question
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, " ")
          .trim(),
      ].join("|")
    )
    .digest("hex");

export async function getCached(
  tenantId: string,
  question: string
): Promise<RagAnswer | null> {
  const { rows } = await pool.query(
    `SELECT answer FROM answer_cache
     WHERE tenant_id = $1 AND question_key = $2
       AND created_at > NOW() - make_interval(mins => $3)`,
    [tenantId, keyFor(question), MAX_AGE_MINUTES]
  );
  return rows[0]?.answer ?? null;
}

export async function setCached(
  tenantId: string,
  question: string,
  answer: RagAnswer
) {
  await pool.query(
    `INSERT INTO answer_cache (tenant_id, question_key, answer) VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, question_key) DO UPDATE SET answer = $3, created_at = NOW()`,
    [tenantId, keyFor(question), answer]
  );
}

// Called when a tenant's documents change, so nobody gets an answer from old text.
export async function clearCache(tenantId: string) {
  await pool.query(`DELETE FROM answer_cache WHERE tenant_id = $1`, [tenantId]);
}
