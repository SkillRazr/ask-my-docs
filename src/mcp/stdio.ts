import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server";

// Over stdio, the client starts this process and talks to it through stdin and
// stdout. stdout carries the protocol, so nothing else may be printed there.
console.log = console.error;

// A local server runs on your own machine with your own data, so the tenant comes
// from your config. It is never a tool argument.
const tenantId = process.env.MCP_TENANT_ID ?? "default";
const server = createMcpServer({
  tenantId,
  caller: "mcp-stdio",
  role: "viewer", // other apps only ever get the read-only tools
});
await server.connect(new StdioServerTransport());
console.error(
  `ask-my-docs MCP server running on stdio for tenant "${tenantId}"`
);
