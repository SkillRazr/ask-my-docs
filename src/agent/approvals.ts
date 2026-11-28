import { randomUUID } from "node:crypto";
import { pool } from "../db/pool";
import { can, isRole } from "../auth/rbac";
import type { User } from "../auth/session";
import { runTool, ToolError, tools } from "../tools/registry";
import { saveTurns } from "./memory";

// Human in the loop: when the agent wants to change something, the change waits here
// until the user approves or rejects it. Reading needs no approval; writing always does.
const EXPIRES_MINUTES = 15;

export async function requestApproval(input: {
  tenantId: string;
  userId: string;
  conversationId: string;
  tool: string;
  args: unknown;
}) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO pending_actions (id, tenant_id, user_id, conversation_id, tool, arguments)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      input.tenantId,
      input.userId,
      input.conversationId,
      input.tool,
      JSON.stringify(input.args ?? {}),
    ]
  );
  return id;
}

export type Decision =
  | { status: "approved"; result: string }
  | { status: "rejected" | "expired" }
  | { status: "not_found" | "forbidden"; error: string };

export async function decide(
  actionId: string,
  user: User,
  approve: boolean
): Promise<Decision> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    // FOR UPDATE locks the row, so a double click can't run the action twice.
    const { rows } = await db.query(
      `SELECT * FROM pending_actions
       WHERE id = $1 AND user_id = $2 AND tenant_id = $3 AND status = 'pending'
       FOR UPDATE`,
      [actionId, user.id, user.tenantId]
    );
    const action = rows[0];
    if (!action) {
      await db.query("ROLLBACK");
      return { status: "not_found", error: "No pending action with that id." };
    }

    const finish = async (status: string, result: string | null = null) => {
      await db.query(
        `UPDATE pending_actions SET status = $2, result = $3, decided_at = NOW() WHERE id = $1`,
        [actionId, status, result]
      );
      await db.query("COMMIT");
    };

    const ageMinutes = (Date.now() - action.created_at.getTime()) / 60_000;
    if (ageMinutes > EXPIRES_MINUTES) {
      await finish("expired");
      return { status: "expired" };
    }
    if (!approve) {
      await finish("rejected");
      await note(action.conversation_id, `The user rejected ${action.tool}.`);
      return { status: "rejected" };
    }

    // Check the role again now, from the database: it may have changed since the
    // user signed in, and the session token only knows the role at sign-in.
    const current = await db.query(`SELECT role FROM users WHERE id = $1`, [
      user.id,
    ]);
    const role = current.rows[0]?.role;
    const [server, toolName] = String(action.tool).split("__");
    const tool = tools.find((t) => t.name === toolName);
    if (
      server !== "docs" ||
      !tool ||
      !isRole(role) ||
      !can(role, tool.permission)
    ) {
      await finish("rejected", "forbidden");
      return { status: "forbidden", error: "You can't approve this action." };
    }

    let result: string;
    try {
      result = await runTool(toolName, action.arguments, {
        tenantId: user.tenantId,
        caller: "agent",
        role,
      });
    } catch (error) {
      result = JSON.stringify({
        error: error instanceof ToolError ? error.message : "The tool failed.",
      });
    }
    await finish("approved", result);
    await note(
      action.conversation_id,
      `The user approved ${action.tool}. Result: ${result}`
    );
    return { status: "approved", result };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}

// Adds the decision to the conversation, so the agent knows what happened next turn.
async function note(conversationId: string | null, text: string) {
  if (conversationId)
    await saveTurns(conversationId, [
      { role: "assistant", content: `(${text})` },
    ]);
}
