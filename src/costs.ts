import "dotenv/config";
import { pool } from "./db/pool";

// What your app spent, from the llm_usage table. Usage: npm run costs [-- days]
const days = Number(process.argv[2] ?? 7);

const byPurpose = await pool.query(
  `SELECT purpose, model, COUNT(*)::int AS calls,
          SUM(input_tokens)::int AS input_tokens, SUM(output_tokens)::int AS output_tokens,
          ROUND(SUM(cost_usd), 4)::float AS cost_usd, ROUND(AVG(latency_ms))::int AS avg_ms
   FROM llm_usage WHERE created_at > NOW() - make_interval(days => $1)
   GROUP BY purpose, model ORDER BY cost_usd DESC`,
  [days]
);
console.log(`LLM usage in the last ${days} days, by purpose:`);
console.table(byPurpose.rows);

const byTenant = await pool.query(
  `SELECT tenant_id, COUNT(*)::int AS calls, ROUND(SUM(cost_usd), 4)::float AS cost_usd
   FROM llm_usage WHERE created_at > NOW() - make_interval(days => $1)
   GROUP BY tenant_id ORDER BY cost_usd DESC`,
  [days]
);
console.log("By tenant:");
console.table(byTenant.rows);

const toolCalls = await pool.query(
  `SELECT tool, caller, COUNT(*)::int AS calls, COUNT(*) FILTER (WHERE NOT ok)::int AS failed,
          ROUND(AVG(latency_ms))::int AS avg_ms
   FROM tool_calls WHERE created_at > NOW() - make_interval(days => $1)
   GROUP BY tool, caller ORDER BY calls DESC`,
  [days]
);
console.log("Tool calls:");
console.table(toolCalls.rows);
const runs = await pool.query(
  `SELECT stop_reason, COUNT(*)::int AS runs, ROUND(AVG(steps), 1)::float AS avg_steps,
          ROUND(AVG(latency_ms))::int AS avg_ms
   FROM agent_runs WHERE created_at > NOW() - make_interval(days => $1)
   GROUP BY stop_reason ORDER BY runs DESC`,
  [days]
);
console.log("Agent runs (episode 5):");
console.table(runs.rows);
const feedback = await pool.query(
  `SELECT mode, COUNT(*) FILTER (WHERE rating = 1)::int AS thumbs_up,
          COUNT(*) FILTER (WHERE rating = -1)::int AS thumbs_down
   FROM feedback WHERE created_at > NOW() - make_interval(days => $1)
   GROUP BY mode ORDER BY mode`,
  [days]
);
console.log("Feedback from the web UI (episode 6):");
console.table(feedback.rows);
await pool.end();
