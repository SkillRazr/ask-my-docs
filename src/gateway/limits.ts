import { pool } from "../db/pool";

const REQUESTS_PER_MINUTE = Number(process.env.USER_REQUESTS_PER_MINUTE ?? 20);
const DAILY_BUDGET_USD = Number(process.env.USER_DAILY_BUDGET_USD ?? 0.5);

// Counts this request in the user's current one-minute window, in one statement, so
// two requests at the same moment can't both slip under the limit. Returns how many
// seconds to wait, or 0 if the request may go ahead.
export async function rateLimit(userKey: string) {
  const { rows } = await pool.query(
    `INSERT INTO rate_limits (user_key, window_start, count)
     VALUES ($1, date_trunc('minute', NOW()), 1)
     ON CONFLICT (user_key, window_start) DO UPDATE SET count = rate_limits.count + 1
     RETURNING count, EXTRACT(EPOCH FROM (date_trunc('minute', NOW()) + INTERVAL '1 minute' - NOW()))::int AS wait`,
    [userKey]
  );
  return rows[0].count > REQUESTS_PER_MINUTE ? Math.max(1, rows[0].wait) : 0;
}

// What this user's LLM calls have cost today (UTC), from llm_usage.
export async function spentToday(userKey: string) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(cost_usd), 0)::float AS spent FROM llm_usage
     WHERE user_key = $1 AND created_at >= date_trunc('day', NOW())`,
    [userKey]
  );
  return rows[0].spent as number;
}

export const overBudget = async (userKey: string) =>
  (await spentToday(userKey)) >= DAILY_BUDGET_USD;

// Old windows are useless after a minute. Run this now and then (episode 11 runs it
// on a schedule).
export async function cleanUpRateLimits() {
  await pool.query(
    `DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 hour'`
  );
}
