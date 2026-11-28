import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// A tiny MCP client, to test your server the way Claude Desktop or an agent would.
// npm run mcp:client            starts the stdio server itself
// npm run mcp:client -- --http  talks to http://localhost:3000/mcp (run npm run dev first)
const useHttp = process.argv.includes("--http");

const transport = useHttp
  ? new StreamableHTTPClientTransport(
      new URL(process.env.MCP_URL ?? "http://localhost:3000/mcp"),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${process.env.MCP_CLIENT_KEY ?? ""}`,
          },
        },
      }
    )
  : new StdioClientTransport({
      command: "npx",
      args: ["tsx", "src/mcp-stdio.ts"],
    });

const client = new Client({
  name: "ask-my-docs-test-client",
  version: "1.0.0",
});
await client.connect(transport);

const { tools } = await client.listTools();
console.log("Tools:");
for (const tool of tools) console.log(`- ${tool.name}: ${tool.description}`);

const show = (
  label: string,
  result: Awaited<ReturnType<typeof client.callTool>>
) => {
  const content = result.content as { type: string; text?: string }[];
  const text = content.map((part) => part.text ?? "").join("\n");
  console.log(`\n${label}${result.isError ? " (error)" : ""}:\n${text}`);
};

show(
  "list_documents",
  await client.callTool({ name: "list_documents", arguments: {} })
);
show(
  "search_docs",
  await client.callTool({
    name: "search_docs",
    arguments: { query: "notice period", limit: 2 },
  })
);
show(
  "ask_docs",
  await client.callTool({
    name: "ask_docs",
    arguments: { question: "What is the notice period for interns?" },
  })
);
show(
  "search_docs with a bad argument",
  await client.callTool({ name: "search_docs", arguments: { query: "x" } })
);

await client.close();
