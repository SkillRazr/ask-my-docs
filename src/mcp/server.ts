import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { can } from "../auth/rbac";
import { runTool, ToolError, tools, type ToolContext } from "../tools/registry";

// An MCP server that offers the same tools as the assistant, for one tenant.
// Any MCP client (Claude Desktop, VS Code, Cursor, an agent you write) can list
// these tools and call them.
export function createMcpServer(context: ToolContext) {
  const server = new McpServer({ name: "ask-my-docs", version: "1.0.0" });

  // Only the tools this caller's role may use. The others don't exist for them.
  for (const tool of tools.filter((t) => can(context.role, t.permission))) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        // Hints for clients: whether the tool only reads, and whether calling it twice
        // is harmless. Clients (and your agent) ask a person before a tool that writes.
        annotations: {
          readOnlyHint: tool.readOnly,
          destructiveHint: false,
          idempotentHint: tool.readOnly,
          openWorldHint: false,
        },
      },
      async (args) => {
        try {
          return {
            content: [
              {
                type: "text" as const,
                text: await runTool(tool.name, args, context),
              },
            ],
          };
        } catch (error) {
          if (!(error instanceof ToolError)) console.error(error); // details stay in your logs
          const message =
            error instanceof ToolError
              ? error.message
              : "The tool failed. Please try again.";
          return {
            isError: true,
            content: [{ type: "text" as const, text: message }],
          };
        }
      }
    );
  }
  return server;
}
