import { AsyncLocalStorage } from "node:async_hooks";
import { pool } from "../db/pool";

// US dollars per million tokens. Prices change, so check https://openai.com/api/pricing
// and update this table when they do. A model that isn't listed costs $0 here.
const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
};

// The API answers with a dated name such as "gpt-4.1-mini-2025-04-14", so match the
// longest name in the table that it starts with.
export function costOf(
  model: string,
  inputTokens: number,
  outputTokens: number
) {
  const name = Object.keys(PRICES)
    .filter((key) => model.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  if (!name) return 0;
  const price = PRICES[name];
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

// Which tenant (and, since episode 8, which user) the current request is for. Set it
// once at the start of a request with withTenant(); every LLM call made inside it is
// then billed to them, without passing ids through every function. An inner call
// that only knows the tenant keeps the user from the outer one.
const current = new AsyncLocalStorage<{ tenantId: string; userKey?: string }>();

export const withTenant = <T>(
  tenantId: string,
  work: () => Promise<T>,
  userKey = current.getStore()?.userKey
) => current.run({ tenantId, userKey }, work);

export async function recordUsage(
  purpose: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  startedAt: number
) {
  const tenantId = current.getStore()?.tenantId ?? "none";
  const userKey = current.getStore()?.userKey ?? null;
  try {
    await pool.query(
      `INSERT INTO llm_usage (tenant_id, purpose, model, input_tokens, output_tokens, cost_usd, latency_ms, user_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        tenantId,
        purpose,
        model,
        inputTokens,
        outputTokens,
        costOf(model, inputTokens, outputTokens),
        Date.now() - startedAt,
        userKey,
      ]
    );
  } catch (error) {
    // Accounting must never break an answer. Log it and carry on.
    console.error("Couldn't record LLM usage:", error);
  }
}

// Wraps a Responses API call: times it and records its tokens and cost.
export async function tracked<
  T extends {
    model: string;
    usage?: { input_tokens: number; output_tokens: number } | null;
  },
>(purpose: string, call: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  const response = await call();
  await recordUsage(
    purpose,
    response.model,
    response.usage?.input_tokens ?? 0,
    response.usage?.output_tokens ?? 0,
    startedAt
  );
  return response;
}
