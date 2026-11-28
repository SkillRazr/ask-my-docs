import type express from "express";

// Who is asking. Since episode 7 this is the signed-in user, set by authenticate
// and checked by requirePermission before any route that calls these runs.
// Every route already used these two functions, so they got real identity at once.
const userIn = (req: express.Request) => {
  if (!req.user)
    throw new Error("No signed-in user: add requirePermission to the route");
  return req.user;
};

export const tenantOf = (req: express.Request) => userIn(req).tenantId;

export const userOf = (req: express.Request) => userIn(req).id;

export const roleOf = (req: express.Request) => userIn(req).role;
