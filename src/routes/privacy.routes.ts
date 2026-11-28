import express from "express";
import { requirePermission } from "../auth/middleware";
import { eraseUserData, exportUserData } from "../governance/privacy";
import { tenantOf, userOf } from "./identity";

// Every signed-in user can download, and erase, their own data (episode 12).
export const privacyRouter = express.Router();
const signedIn = requirePermission("documents:read"); // every role has it

privacyRouter.get("/me/data", signedIn, async (req, res) => {
  const data = await exportUserData(tenantOf(req), userOf(req));
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="ask-my-docs-my-data.json"'
  );
  res.json(data);
});

privacyRouter.delete("/me/data", signedIn, async (req, res) => {
  res.json({ erased: await eraseUserData(tenantOf(req), userOf(req)) });
});
