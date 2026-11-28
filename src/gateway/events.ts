import { trace } from "@opentelemetry/api";
import { pool } from "../db/pool";
import { log } from "../observability";

// Records that a guardrail stepped in. Only the kind and a short detail, never the
// user's text: a log full of the personal data you just redacted defeats the point.
export async function logEvent(
  tenantId: string,
  userKey: string | null,
  kind: string,
  detail = ""
) {
  // Also on the current trace and in the logs, where alerts can count them (episode 9).
  trace.getActiveSpan()?.addEvent("guardrail", { kind });
  log("WARNING", "guardrail", { kind, tenantId });
  await pool
    .query(
      `INSERT INTO guardrail_events (tenant_id, user_key, kind, detail) VALUES ($1, $2, $3, $4)`,
      [tenantId, userKey, kind, detail.slice(0, 300)]
    )
    .catch((error) => console.error("Couldn't log a guardrail event:", error));
}
