import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "../mcp/server";

export const mcpRouter = express.Router();

// MCP_API_KEYS="a-long-random-key:default,another-key:acme"
// Each key belongs to one tenant, so the key decides whose documents a client sees.
// Episode 7 replaces these keys with proper sign-in (OAuth).
const tenantByKey = new Map(
  (process.env.MCP_API_KEYS ?? "")
    .split(",")
    .map((pair) => pair.split(":").map((part) => part.trim()))
    .filter(([key, tenant]) => key && tenant) as [string, string][]
);

mcpRouter.post("/mcp", async (req, res) => {
  const key = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const tenantId = key ? tenantByKey.get(key) : undefined;
  if (!tenantId) {
    res
      .status(401)
      .json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Missing or invalid API key" },
        id: null,
      });
    return;
  }

  // Stateless: a new server and transport for every request, so nothing is shared
  // between clients or tenants, and any instance of the API can answer any request.
  const server = createMcpServer({
    tenantId,
    caller: "mcp-http",
    role: "viewer", // an API key only ever gets the read-only tools
  });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res
        .status(500)
        .json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
    }
  }
});

// A stateless server has no sessions to stream to (GET) or end (DELETE).
mcpRouter.all("/mcp", (_req, res) => {
  res
    .status(405)
    .set("Allow", "POST")
    .json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed" },
      id: null,
    });
});
