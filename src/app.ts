import { fileURLToPath } from "node:url";
import express from "express";
import { context } from "@opentelemetry/api";
import { log } from "./observability";
import { pool } from "./db/pool";
import { askRouter } from "./routes/ask.routes";
import { mcpRouter } from "./routes/mcp.routes";
import { agentRouter } from "./routes/agent.routes";
import { passagesRouter } from "./routes/passages.routes";
import { feedbackRouter } from "./routes/feedback.routes";
import { authenticate } from "./auth/middleware";
import { authRouter } from "./routes/auth.routes";
import { adminRouter } from "./routes/admin.routes";
import { internalRouter } from "./routes/internal.routes";
import { privacyRouter } from "./routes/privacy.routes";

export const app = express();
app.use(express.json());
// One structured log line per request: what, who, how it ended and how long it took.
app.use((req, res, next) => {
  const startedAt = Date.now();
  const active = context.active(); // the request's trace, so the log line links to it
  res.on("finish", () => {
    // Static files, unknown paths and health checks: not worth a line
    if (!req.route || req.path === "/healthz") return;
    context.with(active, () =>
      log(res.statusCode >= 500 ? "ERROR" : "INFO", "request", {
        method: req.method,
        path: req.route?.path ?? req.path,
        status: res.statusCode,
        latencyMs: Date.now() - startedAt,
        user: req.user?.id,
      })
    );
  });
  next();
});
// For Cloud Run's health checks: is the app up, and can it reach the database?
app.get("/healthz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

// The same image runs as two Cloud Run services (episode 11): the public app, and a
// private worker that only indexes documents for Cloud Tasks. The worker has no
// sign-in, no web UI and no LLM routes, so there's nothing else on it to attack.
if (process.env.APP_MODE === "worker") {
  app.use(internalRouter);
} else {
  app.use(authenticate); // sets req.user from the session cookie or a Bearer token
  app.use(authRouter); // sign in with Google, sign out, who am I (episode 7)
  app.use(adminRouter); // invite users and set roles, for admins (episode 7)
  // Keep your episode 1 routes (documents and search) registered here too.
  app.use(askRouter);
  app.use(mcpRouter); // the MCP server over HTTP, at /mcp
  app.use(agentRouter); // the agent, at /agent, /agent/stream and /agent/actions/:id
  app.use(passagesRouter); // one source passage, for the UI
  app.use(feedbackRouter); // thumbs up or down, from the UI
  app.use(privacyRouter); // download or erase your own data (episode 12)

  // The web UI (episode 6): plain HTML, CSS and JavaScript, served from public/.
  app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));
}
