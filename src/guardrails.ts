import "dotenv/config";
import { pool } from "./db/pool";
import { audit } from "./governance/audit";
import { dispatch } from "./pipeline/dispatch";

// What the gateway did, and the documents waiting for review.
// npm run guardrails                     the report (last 7 days)
// npm run guardrails -- release <job id> index a quarantined document after you've read it
const [command, id] = process.argv.slice(2);

if (command === "release") {
  const { rows } = await pool.query(
    `UPDATE ingestion_jobs SET status = 'queued', reviewed = true, attempts = 0, updated_at = NOW()
     WHERE id = $1 AND status = 'quarantined' RETURNING id, tenant_id, title`,
    [id]
  );
  const job = rows[0];
  if (job) {
    await dispatch(job.id); // on Google Cloud, hand it to the worker (episode 11)
    await audit({
      tenantId: job.tenant_id,
      actor: "cli",
      action: "document.released",
      target: job.title,
    });
  }
  console.log(
    job
      ? "Released. Run the worker to index it."
      : "No quarantined job with that id."
  );
} else {
  const events = await pool.query(
    `SELECT kind, COUNT(*)::int AS events, COUNT(DISTINCT user_key)::int AS users
     FROM guardrail_events WHERE created_at > NOW() - INTERVAL '7 days'
     GROUP BY kind ORDER BY events DESC`
  );
  console.log("Guardrail events, last 7 days:");
  console.table(events.rows);

  const spenders = await pool.query(
    `SELECT u.email, ROUND(SUM(l.cost_usd)::numeric, 4)::float AS cost_usd_today
     FROM llm_usage l JOIN users u ON u.id::text = l.user_key
     WHERE l.created_at >= date_trunc('day', NOW())
     GROUP BY u.email ORDER BY 2 DESC LIMIT 5`
  );
  console.log("Top spenders today:");
  console.table(spenders.rows);

  const held = await pool.query(
    `SELECT id, tenant_id, title, created_at FROM ingestion_jobs
     WHERE status = 'quarantined' ORDER BY id`
  );
  console.log("Documents waiting for review:");
  console.table(held.rows);
}
await pool.end();
