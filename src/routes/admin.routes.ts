import express from "express";
import { z } from "zod";
import { requirePermission } from "../auth/middleware";
import { ROLES } from "../auth/rbac";
import { listUsers, removeUser, upsertUser } from "../auth/users";
import { tenantOf } from "./identity";

export const adminRouter = express.Router();
adminRouter.use("/admin", requirePermission("users:manage"));

// An admin manages the users of their own tenant, and only their own.
adminRouter.get("/admin/users", async (req, res) => {
  res.json(await listUsers(tenantOf(req)));
});

const Invite = z.object({ email: z.email(), role: z.enum(ROLES) });

adminRouter.post("/admin/users", async (req, res) => {
  const body = Invite.safeParse(req.body);
  if (!body.success) {
    res
      .status(400)
      .json({ error: "Send an email and a role (viewer, editor or admin)." });
    return;
  }
  const user = await upsertUser(body.data.email, tenantOf(req), body.data.role);
  if (!user) {
    res.status(409).json({ error: "Couldn't add that user." });
    return;
  }
  res.json({ email: user.email, role: user.role });
});

adminRouter.delete("/admin/users/:email", async (req, res) => {
  const email = req.params.email.toLowerCase();
  if (email === req.user!.email.toLowerCase()) {
    res.status(400).json({ error: "You can't remove yourself." });
    return;
  }
  const inTenant = (await listUsers(tenantOf(req))).some(
    (u) => u.email === email
  );
  if (!inTenant || !(await removeUser(email))) {
    res.status(404).json({ error: "No such user." });
    return;
  }
  res.json({ removed: email });
});
