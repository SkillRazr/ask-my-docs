import { pool } from "../db/pool";
import { audit } from "./audit";

// How long each kind of data is kept (episode 12). Keep personal data only as
// long as it's useful, then delete it automatically. Every number here is a
// decision to write down in your privacy notice, not a technical default.
export const RETENTION_DAYS = {
  conversations: Number(process.env.KEEP_CONVERSATIONS_DAYS ?? 90),
  feedback: Number(process.env.KEEP_FEEDBACK_DAYS ?? 180),
  guardrailEvents: Number(process.env.KEEP_GUARDRAIL_EVENTS_DAYS ?? 90),
  usageUserLink: Number(process.env.KEEP_USAGE_USER_DAYS ?? 30),
  jobContent: Number(process.env.KEEP_JOB_CONTENT_DAYS ?? 30),
};

export async function applyRetention() {
  const run = async (sql: string, days: number) =>
    (await pool.query(sql, [days])).rowCount ?? 0;
  const older = `NOW() - make_interval(days => $1)`;

  const removed = {
    // Conversations nobody has touched for a while, with their messages and runs.
    conversations: await run(
      `DELETE FROM conversations WHERE updated_at < ${older}`,
      RETENTION_DAYS.conversations
    ),
    feedback: await run(
      `DELETE FROM feedback WHERE created_at < ${older}`,
      RETENTION_DAYS.feedback
    ),
    guardrailEvents: await run(
      `DELETE FROM guardrail_events WHERE created_at < ${older}`,
      RETENTION_DAYS.guardrailEvents
    ),
    // Costs stay for reporting, but after a month they no longer say who.
    usageUnlinked: await run(
      `UPDATE llm_usage SET user_key = NULL WHERE user_key IS NOT NULL AND created_at < ${older}`,
      RETENTION_DAYS.usageUserLink
    ),
    // Finished jobs keep a copy of the whole document. The chunks are what's
    // searched, so the copy can go.
    jobContent: await run(
      `UPDATE ingestion_jobs SET content = '' WHERE status = 'done' AND content <> '' AND updated_at < ${older}`,
      RETENTION_DAYS.jobContent
    ),
    rateLimits: await run(
      `DELETE FROM rate_limits WHERE window_start < ${older}`,
      1
    ),
    expiredActions: await run(
      `DELETE FROM pending_actions WHERE status <> 'pending' AND created_at < ${older}`,
      RETENTION_DAYS.conversations
    ),
  };
  await audit({
    tenantId: "*",
    actor: "system",
    action: "retention.applied",
    details: removed,
  });
  return removed;
}
