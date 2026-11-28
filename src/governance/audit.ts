import { trace } from "@opentelemetry/api";
import { pool } from "../db/pool";
import { log } from "../observability";

// The audit trail (episode 12): who did what, to what, and when. Write one entry
// for every action someone might later ask about: "who gave Priya admin rights?",
// "who approved adding this document?", "when did this user ask us to delete
// their data?". Record ids and kinds, never the content of questions or documents.
export async function audit(entry: {
  tenantId: string;
  actor: string; // a user id, or "cli" or "system"
  action: string;
  target?: string;
  details?: Record<string, unknown>;
}) {
  const traceId = trace.getActiveSpan()?.spanContext().traceId ?? null;
  await pool.query(
    `INSERT INTO audit_log (tenant_id, actor, action, target, details, trace_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      entry.tenantId,
      entry.actor,
      entry.action,
      entry.target ?? null,
      entry.details ?? {},
      traceId,
    ]
  );
  // Also a log line, so audit events can be searched and alerted on in Cloud Logging.
  log("INFO", "audit", { action: entry.action, tenantId: entry.tenantId });
}
