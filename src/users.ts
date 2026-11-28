import "dotenv/config";
import { isRole } from "./auth/rbac";
import { listUsers, removeUser, upsertUser } from "./auth/users";
import { pool } from "./db/pool";

// Manage users from the terminal. You need this for the very first admin: nobody can
// sign in until someone is invited, and only an admin can invite through the app.
// npm run users -- add you@gmail.com default admin
// npm run users -- list default
// npm run users -- remove someone@gmail.com
const [command, ...args] = process.argv.slice(2);

if (command === "add") {
  const [email, tenantId = "default", role = "viewer"] = args;
  if (!email || !isRole(role))
    throw new Error(
      "Usage: npm run users -- add <email> [tenant] [viewer|editor|admin]"
    );
  const user = await upsertUser(email, tenantId, role);
  console.log(
    user
      ? `${user.email} is now ${user.role} in "${user.tenant_id}".`
      : `${email} belongs to another tenant.`
  );
} else if (command === "list") {
  console.table(await listUsers(args[0] ?? "default"));
} else if (command === "remove") {
  console.log((await removeUser(args[0] ?? "")) ? "Removed." : "No such user.");
} else {
  console.log(
    "Commands: add <email> [tenant] [role], list [tenant], remove <email>"
  );
}
await pool.end();
