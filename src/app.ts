import express from "express";
import { askRouter } from "./routes/ask.routes";
import { mcpRouter } from "./routes/mcp.routes";
import { agentRouter } from "./routes/agent.routes";

export const app = express();
app.use(express.json());
// Keep your episode 1 routes (documents and search) registered here too.
app.use(askRouter);
app.use(mcpRouter); // the MCP server over HTTP, at /mcp
app.use(agentRouter); // the agent, at POST /agent
