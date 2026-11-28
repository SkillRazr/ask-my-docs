import type express from "express";
import { can, type Permission } from "./rbac";
import { SESSION_COOKIE, verifySession, type User } from "./session";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User; // set by authenticate when the request has a valid session
    }
  }
}

export function readCookie(req: express.Request, name: string) {
  for (const part of (req.header("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

// Reads the session from the cookie (the browser) or an Authorization: Bearer
// header (scripts and other services), and sets req.user if it's valid.
export const authenticate: express.RequestHandler = async (req, _res, next) => {
  const bearer = req.header("authorization")?.match(/^Bearer (.+)$/)?.[1];
  const token = bearer ?? readCookie(req, SESSION_COOKIE);
  if (token) req.user = (await verifySession(token)) ?? undefined;
  next();
};

// 401: we don't know who you are. 403: we know, and you aren't allowed.
export const requirePermission =
  (permission: Permission): express.RequestHandler =>
  (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: "Please sign in." });
      return;
    }
    if (!can(req.user.role, permission)) {
      res.status(403).json({ error: "You don't have permission to do that." });
      return;
    }
    next();
  };
