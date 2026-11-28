import { pool } from "../db/pool";
import { audit } from "./audit";

// A user's rights over their own data (episode 12). India's DPDP Act, like GDPR,
// gives people the right to see the personal data you hold about them and to have
// it erased. These two functions are how the app keeps that promise.

// Everything the app holds about one user, as one JSON document.
export async function exportUserData(tenantId: string, userId: string) {
  const one = async (sql: string) =>
    (await pool.query(sql, [tenantId, userId])).rows;
  const data = {
    exportedAt: new Date().toISOString(),
    account: (
      await one(
        `SELECT email, role, created_at, last_login_at FROM users WHERE tenant_id = $1 AND id::text = $2`
      )
    )[0],
    conversations: await one(
      `SELECT c.id, c.created_at, c.summary,
              COALESCE(json_agg(json_build_object('role', m.role, 'content', m.content, 'at', m.created_at)
                                ORDER BY m.id) FILTER (WHERE m.id IS NOT NULL), '[]') AS messages
       FROM conversations c LEFT JOIN messages m ON m.conversation_id = c.id
       WHERE c.tenant_id = $1 AND c.user_key = $2
       GROUP BY c.id ORDER BY c.created_at`
    ),
    memories: await one(
      `SELECT content, created_at FROM memories WHERE tenant_id = $1 AND user_key = $2 ORDER BY id`
    ),
    feedback: await one(
      `SELECT question, answer, rating, comment, created_at FROM feedback
       WHERE tenant_id = $1 AND user_key = $2 ORDER BY id`
    ),
    actions: await one(
      `SELECT tool, status, created_at, decided_at FROM pending_actions
       WHERE tenant_id = $1 AND user_id::text = $2 ORDER BY created_at`
    ),
  };
  await audit({
    tenantId,
    actor: userId,
    action: "data.exported",
    target: userId,
  });
  return data;
}

// Erases what the user said and what the app learned about them. The account stays,
// so they can keep using the app; an admin removes the account itself. The audit
// trail keeps the fact that an erasure happened, which the law allows, but no content.
export async function eraseUserData(tenantId: string, userId: string) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const run = async (sql: string) =>
      (await db.query(sql, [tenantId, userId])).rowCount ?? 0;
    const erased = {
      conversations: await run(
        `DELETE FROM conversations WHERE tenant_id = $1 AND user_key = $2`
      ), // their messages and agent runs go with them (ON DELETE CASCADE)
      memories: await run(
        `DELETE FROM memories WHERE tenant_id = $1 AND user_key = $2`
      ),
      feedback: await run(
        `DELETE FROM feedback WHERE tenant_id = $1 AND user_key = $2`
      ),
      actions: await run(
        `DELETE FROM pending_actions WHERE tenant_id = $1 AND user_id::text = $2`
      ),
    };
    // Usage and guardrail records stay for cost and security reporting, but no
    // longer point to the person.
    await run(
      `UPDATE llm_usage SET user_key = NULL WHERE tenant_id = $1 AND user_key = $2`
    );
    await run(
      `UPDATE guardrail_events SET user_key = NULL WHERE tenant_id = $1 AND user_key = $2`
    );
    await db.query("COMMIT");
    await audit({
      tenantId,
      actor: userId,
      action: "data.erased",
      target: userId,
      details: erased,
    });
    return erased;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}
