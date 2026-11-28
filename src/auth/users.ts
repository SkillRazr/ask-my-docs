import { pool } from "../db/pool";
import type { Role } from "./rbac";
import type { User } from "./session";

// Users are invited: signing in with Google proves who you are, and this table says
// whether you may use the app, for which tenant and with which role.
export async function findUserByEmail(email: string): Promise<User | null> {
  const { rows } = await pool.query(
    `UPDATE users SET last_login_at = NOW() WHERE email = lower($1)
     RETURNING id, email, tenant_id, role`,
    [email]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    email: row.email,
    tenantId: row.tenant_id,
    role: row.role,
  };
}

// Adds a user, or changes the role of one already in this tenant. A user who belongs
// to another tenant is left alone: the WHERE stops one tenant's admin from pulling
// someone else's user (and their access) into their own tenant.
export async function upsertUser(email: string, tenantId: string, role: Role) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, tenant_id, role) VALUES (lower($1), $2, $3)
     ON CONFLICT (email) DO UPDATE SET role = $3 WHERE users.tenant_id = $2
     RETURNING id, email, tenant_id, role`,
    [email, tenantId, role]
  );
  return rows[0] ?? null; // null: the email belongs to another tenant
}

export async function listUsers(tenantId: string) {
  const { rows } = await pool.query(
    `SELECT email, role, last_login_at FROM users WHERE tenant_id = $1 ORDER BY email`,
    [tenantId]
  );
  return rows;
}

export async function removeUser(email: string) {
  const { rowCount } = await pool.query(
    `DELETE FROM users WHERE email = lower($1)`,
    [email]
  );
  return (rowCount ?? 0) > 0;
}
