import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runTool, ToolError, tools, type ToolContext } from "../tools/registry";

// An MCP server that offers the same tools as the assistant, for one tenant.
// Any MCP client (Claude Desktop, VS Code, Cursor, an agent you write) can list
// these tools and call them.
export function createMcpServer(context: ToolContext) {
  const server = new McpServer({ name: "ask-my-docs", version: "1.0.0" });

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        // Hints for clients: these tools only read, and calling one twice is harmless.
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
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
