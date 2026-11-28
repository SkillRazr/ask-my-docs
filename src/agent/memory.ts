import { randomUUID } from "node:crypto";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { pool } from "../db/pool";
import { embed } from "../services/embedding.service";
import { client, SMALL_MODEL } from "../services/llm";
import { tracked } from "../services/usage";

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

// ---- Short-term memory: the conversation ----

export async function startConversation(tenantId: string, userKey: string) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO conversations (id, tenant_id, user_key) VALUES ($1, $2, $3)`,
    [id, tenantId, userKey]
  );
  return id;
}

// Returns the conversation only if it belongs to this tenant and user. Someone
// else's conversation id must behave exactly like one that doesn't exist.
export async function findConversation(
  id: string,
  tenantId: string,
  userKey: string
) {
  const { rows } = await pool.query(
    `SELECT id, summary, summarized_up_to FROM conversations
     WHERE id = $1 AND tenant_id = $2 AND user_key = $3`,
    [id, tenantId, userKey]
  );
  return rows[0] as
    | { id: string; summary: string; summarized_up_to: string }
    | undefined;
}

// Keep the last few messages word for word. Everything older lives in the summary.
const RECENT_MESSAGES = 10;

export async function loadHistory(
  conversationId: string,
  tenantId: string,
  userKey: string
) {
  const conversation = await findConversation(
    conversationId,
    tenantId,
    userKey
  );
  if (!conversation) return null;
  const { rows } = await pool.query(
    `SELECT role, content FROM (
       SELECT id, role, content FROM messages
       WHERE conversation_id = $1 AND id > $2
       ORDER BY id DESC LIMIT $3
     ) recent ORDER BY id`,
    [conversationId, conversation.summarized_up_to, RECENT_MESSAGES]
  );
  return { summary: conversation.summary, recent: rows as Turn[] };
}

export async function saveTurns(conversationId: string, turns: Turn[]) {
  for (const turn of turns) {
    await pool.query(
      `INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)`,
      [conversationId, turn.role, turn.content]
    );
  }
  await pool.query(
    `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
    [conversationId]
  );
}

const Summary = z.object({ summary: z.string() });

// When a conversation grows past RECENT_MESSAGES, fold the older messages into the
// summary. The prompt stays small however long the conversation gets.
export async function compactHistory(conversationId: string) {
  const { rows: conversation } = await pool.query(
    `SELECT summary, summarized_up_to FROM conversations WHERE id = $1`,
    [conversationId]
  );
  const { rows: unsummarized } = await pool.query(
    `SELECT id, role, content FROM messages
     WHERE conversation_id = $1 AND id > $2
     ORDER BY id`,
    [conversationId, conversation[0].summarized_up_to]
  );
  const older = unsummarized.slice(0, -RECENT_MESSAGES); // all but the recent ones
  if (older.length === 0) return;

  const transcript = older.map((m) => `${m.role}: ${m.content}`).join("\n");
  const response = await tracked("summarize", () =>
    client.responses.parse({
      model: SMALL_MODEL,
      instructions:
        "Update the summary of a conversation with the new messages. Keep names, numbers, decisions and open questions. At most 150 words.",
      input: `Summary so far:\n${conversation[0].summary || "(none)"}\n\nNew messages:\n${transcript}`,
      text: { format: zodTextFormat(Summary, "conversation_summary") },
    })
  );
  const summary = response.output_parsed?.summary ?? conversation[0].summary;
  await pool.query(
    `UPDATE conversations SET summary = $2, summarized_up_to = $3 WHERE id = $1`,
    [conversationId, summary, older[older.length - 1].id]
  );
}

// ---- Long-term memory: facts about the user ----

export async function rememberFact(
  tenantId: string,
  userKey: string,
  fact: string
) {
  const [vector] = await embed([fact]);
  // Skip facts we already know, so the same preference isn't stored ten times.
  const { rows } = await pool.query(
    `SELECT 1 FROM memories
     WHERE tenant_id = $1 AND user_key = $2 AND 1 - (embedding <=> $3::vector) > 0.92
     LIMIT 1`,
    [tenantId, userKey, JSON.stringify(vector)]
  );
  if (rows.length > 0) return false;
  await pool.query(
    `INSERT INTO memories (tenant_id, user_key, content, embedding) VALUES ($1, $2, $3, $4)`,
    [tenantId, userKey, fact, JSON.stringify(vector)]
  );
  return true;
}

export async function recallFacts(
  tenantId: string,
  userKey: string,
  query: string,
  limit = 3
) {
  const [vector] = await embed([query]);
  const { rows } = await pool.query(
    `SELECT content FROM memories
     WHERE tenant_id = $1 AND user_key = $2 AND 1 - (embedding <=> $3::vector) > 0.3
     ORDER BY embedding <=> $3::vector
     LIMIT $4`,
    [tenantId, userKey, JSON.stringify(vector), limit]
  );
  return rows.map((row) => row.content as string);
}

export async function forgetUser(tenantId: string, userKey: string) {
  const { rowCount } = await pool.query(
    `DELETE FROM memories WHERE tenant_id = $1 AND user_key = $2`,
    [tenantId, userKey]
  );
  return rowCount ?? 0;
}
