import { pool } from "../db/pool";
import { redact } from "./pii";

// Rules every tool call must pass before it runs, or before it's offered for
// approval. Each rule is small, named and testable, and adding one is one entry here.
export interface ToolCallContext {
  tool: string; // as the model sees it, e.g. docs__add_document
  args: Record<string, unknown>;
  tenantId: string;
  userKey: string;
  callsThisRun: number; // tool calls already made in this agent run
}

interface Rule {
  name: string;
  check(call: ToolCallContext): Promise<string | null> | string | null; // a reason to deny
}

const MAX_TOOL_CALLS_PER_RUN = 8;
const MAX_DOCUMENTS_PER_DAY = 5;

const rules: Rule[] = [
  {
    name: "tool-call-budget",
    check: ({ callsThisRun }) =>
      callsThisRun >= MAX_TOOL_CALLS_PER_RUN
        ? `At most ${MAX_TOOL_CALLS_PER_RUN} tool calls per question.`
        : null,
  },
  {
    name: "no-personal-data-in-documents",
    check: ({ tool, args }) => {
      if (tool !== "docs__add_document") return null;
      const { found } = redact(`${args.title ?? ""}\n${args.content ?? ""}`);
      const sensitive = found.filter(
        (kind) => kind !== "email" && kind !== "phone"
      );
      return sensitive.length
        ? `New documents can't contain ${sensitive.join(", ")}.`
        : null;
    },
  },
  {
    name: "documents-per-day",
    check: async ({ tool, userKey }) => {
      if (tool !== "docs__add_document") return null;
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM pending_actions
         WHERE user_id::text = $1 AND tool = $2 AND created_at > NOW() - INTERVAL '1 day'`,
        [userKey, tool]
      );
      return rows[0].n >= MAX_DOCUMENTS_PER_DAY
        ? `At most ${MAX_DOCUMENTS_PER_DAY} new documents a day.`
        : null;
    },
  },
];

export async function checkToolCall(call: ToolCallContext) {
  for (const rule of rules) {
    const reason = await rule.check(call);
    if (reason) return { allowed: false as const, rule: rule.name, reason };
  }
  return { allowed: true as const };
}
