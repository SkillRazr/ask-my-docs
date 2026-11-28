import type express from "express";

// Who is asking. For now both come from headers, and anyone can set a header, so
// this is NOT security. It lives in one file on purpose: episode 7 replaces these
// two functions with the signed-in user, and every route gets real identity at once.
export const tenantOf = (req: express.Request) =>
  req.header("x-tenant-id") || "default";

export const userOf = (req: express.Request) =>
  req.header("x-user-key") || "anonymous";
