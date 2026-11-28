import { fileURLToPath } from "node:url";
import express from "express";
import { askRouter } from "./routes/ask.routes";
import { mcpRouter } from "./routes/mcp.routes";
import { agentRouter } from "./routes/agent.routes";
import { passagesRouter } from "./routes/passages.routes";
import { feedbackRouter } from "./routes/feedback.routes";
import { authenticate } from "./auth/middleware";
import { authRouter } from "./routes/auth.routes";
import { adminRouter } from "./routes/admin.routes";

export const app = express();
app.use(express.json());
app.use(authenticate); // sets req.user from the session cookie or a Bearer token
app.use(authRouter); // sign in with Google, sign out, who am I (episode 7)
app.use(adminRouter); // invite users and set roles, for admins (episode 7)
// Keep your episode 1 routes (documents and search) registered here too.
app.use(askRouter);
app.use(mcpRouter); // the MCP server over HTTP, at /mcp
app.use(agentRouter); // the agent, at /agent, /agent/stream and /agent/actions/:id
app.use(passagesRouter); // one source passage, for the UI
app.use(feedbackRouter); // thumbs up or down, from the UI

// The web UI (episode 6): plain HTML, CSS and JavaScript, served from public/.
app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));
