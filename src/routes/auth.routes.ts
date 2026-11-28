import express from "express";
import { z } from "zod";
import { finishSignIn, googleEnabled, startSignIn } from "../auth/google";
import { readCookie } from "../auth/middleware";
import {
  SESSION_COOKIE,
  SESSION_HOURS,
  signSession,
  type User,
} from "../auth/session";
import { findUserByEmail } from "../auth/users";
import { audit } from "../governance/audit";

export const authRouter = express.Router();

const SIGN_IN_COOKIE = "signin";
const secure = () => (process.env.APP_URL ?? "").startsWith("https://");

// HttpOnly: page scripts can't read it, so an XSS bug can't steal the session.
// SameSite=Lax: other sites can't make the browser send it with a POST.
// Secure: only sent over HTTPS (once you deploy).
const cookieOptions = (maxAgeMs: number) => ({
  httpOnly: true,
  secure: secure(),
  sameSite: "lax" as const,
  maxAge: maxAgeMs,
  path: "/",
});

async function startSession(
  res: express.Response,
  user: User,
  method: "google" | "dev"
) {
  res.cookie(
    SESSION_COOKIE,
    await signSession(user),
    cookieOptions(SESSION_HOURS * 3600_000)
  );
  await audit({
    tenantId: user.tenantId,
    actor: user.id,
    action: "user.signed_in",
    details: { method },
  });
}

// A quick sign-in for your own laptop, with no Google setup. It trusts whatever
// email you type, so it only works when you turn it on and never in production.
const devLoginEnabled = () =>
  process.env.AUTH_DEV_LOGIN === "true" &&
  process.env.NODE_ENV !== "production";

authRouter.get("/auth/config", (_req, res) => {
  res.json({ google: googleEnabled(), devLogin: devLoginEnabled() });
});

authRouter.get("/auth/google", (_req, res) => {
  const { url, flow } = startSignIn();
  res.cookie(SIGN_IN_COOKIE, JSON.stringify(flow), cookieOptions(10 * 60_000));
  res.redirect(url);
});

authRouter.get("/auth/callback", async (req, res) => {
  const fail = (reason: string) => res.redirect(`/?error=${reason}`);
  try {
    const flow = JSON.parse(readCookie(req, SIGN_IN_COOKIE) ?? "null");
    res.clearCookie(SIGN_IN_COOKIE, { path: "/" });
    const code = String(req.query.code ?? "");
    if (!flow || !code || req.query.state !== flow.state)
      return fail("sign-in-expired");

    const email = await finishSignIn(code, flow);
    const user = await findUserByEmail(email);
    if (!user) return fail("not-invited"); // a real Google account, but not one of your users
    await startSession(res, user, "google");
    res.redirect("/");
  } catch (error) {
    console.error(error);
    fail("sign-in-failed");
  }
});

authRouter.post("/auth/dev-login", async (req, res) => {
  const email = z.email().safeParse(req.body?.email);
  if (!devLoginEnabled() || !email.success) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  const user = await findUserByEmail(email.data);
  if (!user) {
    res.status(403).json({ error: "That email hasn't been invited." });
    return;
  }
  await startSession(res, user, "dev");
  res.json(user);
});

authRouter.get("/auth/me", (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Please sign in." });
    return;
  }
  res.json(req.user);
});

authRouter.post("/auth/logout", async (req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  if (req.user)
    await audit({
      tenantId: req.user.tenantId,
      actor: req.user.id,
      action: "user.signed_out",
    });
  res.json({ signedOut: true });
});
