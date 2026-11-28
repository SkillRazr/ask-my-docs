import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { FunctionTool } from "openai/resources/responses/responses";
import type { Role } from "../auth/rbac";
import { createMcpServer } from "../mcp/server";
import { rememberFact } from "./memory";

// Extra MCP servers the agent may use, from mcp-servers.json (optional). Only add
// servers you trust, and list the tools the agent may call: a server can offer
// tools that write or delete.
interface ServerConfig {
  name: string;
  command?: string; // a local server started over stdio
  args?: string[];
  url?: string; // or a remote server over HTTP
  headers?: Record<string, string>;
  allowTools: string[];
}

export interface Toolbox {
  definitions: FunctionTool[]; // what the model sees
  call(name: string, args: unknown): Promise<string>;
  needsApproval(name: string): boolean; // true for any tool that isn't read-only
  close(): Promise<void>;
}

interface Connected {
  name: string;
  client: Client;
  allow?: string[];
}

// Tool names the model sees are "<server>__<tool>", so two servers can both have
// a "search" tool without clashing.
const SEPARATOR = "__";

export async function openToolbox(
  tenantId: string,
  userKey: string,
  role: Role
): Promise<Toolbox> {
  const servers: Connected[] = [];

  // 1. Your own MCP server from episode 4, connected in memory: the same tools and
  //    checks as over stdio or HTTP, without starting a process. It is created for
  //    this tenant, so the agent can only ever see this tenant's documents. And it
  //    gets the user's role, so the agent can never do more than the user could.
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createMcpServer({ tenantId, caller: "agent", role }).connect(
    serverSide
  );
  servers.push({ name: "docs", client: await connect(clientSide) });

  // 2. Any extra servers you configured.
  for (const config of await readServerConfigs()) {
    const transport = config.url
      ? new StreamableHTTPClientTransport(new URL(config.url), {
          requestInit: { headers: config.headers },
        })
      : new StdioClientTransport({
          command: config.command!,
          args: config.args ?? [],
          env: getDefaultEnvironment(), // don't hand your API keys to other servers
        });
    servers.push({
      name: config.name,
      client: await connect(transport),
      allow: config.allowTools,
    });
  }

  const definitions: FunctionTool[] = [];
  const readOnly = new Set<string>(["remember"]); // saving a note about yourself is safe
  for (const server of servers) {
    const { tools } = await server.client.listTools();
    for (const tool of tools) {
      if (server.allow && !server.allow.includes(tool.name)) continue;
      // Trust the read-only hint only from your own server. Any other server's
      // tools need approval, whatever they claim.
      if (server.name === "docs" && tool.annotations?.readOnlyHint === true)
        readOnly.add(`${server.name}${SEPARATOR}${tool.name}`);
      definitions.push({
        type: "function",
        name: `${server.name}${SEPARATOR}${tool.name}`,
        description: tool.description ?? "",
        parameters: tool.inputSchema as Record<string, unknown>,
        strict: false,
      });
    }
  }

  // 3. One local tool that isn't on any MCP server: saving a fact about the user.
  definitions.push({
    type: "function",
    name: "remember",
    description:
      "Save a short fact about the user for future conversations, such as their role, team, location or preferences. Never save facts about documents, passwords or secrets.",
    parameters: {
      type: "object",
      properties: {
        fact: {
          type: "string",
          description: "One short sentence about the user",
        },
      },
      required: ["fact"],
      additionalProperties: false,
    },
    strict: true,
  });

  return {
    definitions,
    async call(name, args) {
      if (name === "remember") {
        const fact = String((args as { fact?: unknown })?.fact ?? "")
          .trim()
          .slice(0, 300);
        if (!fact) return JSON.stringify({ error: "fact is required" });
        // A simple guard. The description already says no secrets, but a model can be
        // talked into anything, so the code checks too.
        if (
          /password|passcode|otp|pin code|api[ _-]?key|secret|card number/i.test(
            fact
          )
        ) {
          return JSON.stringify({ error: "Secrets can't be remembered." });
        }
        const saved = await rememberFact(tenantId, userKey, fact);
        return JSON.stringify({
          saved,
          note: saved ? "Remembered." : "Already known.",
        });
      }
      const [serverName, toolName] = name.split(SEPARATOR);
      const server = servers.find((s) => s.name === serverName);
      const allowed = definitions.some((d) => d.name === name);
      if (!server || !toolName || !allowed)
        return JSON.stringify({ error: `Unknown tool: ${name}` });

      const result = await server.client.callTool({
        name: toolName,
        arguments: (args ?? {}) as Record<string, unknown>,
      });
      const content = result.content as { type: string; text?: string }[];
      const text = content
        .map((part) => part.text ?? `[${part.type}]`)
        .join("\n");
      return result.isError ? JSON.stringify({ error: text }) : text;
    },
    // Only for tools this user really has. An unknown tool name gets an error from
    // call() instead, never an approval request.
    needsApproval: (name) =>
      definitions.some((d) => d.name === name) && !readOnly.has(name),
    async close() {
      await Promise.all(servers.map((s) => s.client.close()));
    },
  };
}

async function connect(transport: Transport) {
  const client = new Client({ name: "ask-my-docs-agent", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

async function readServerConfigs(): Promise<ServerConfig[]> {
  try {
    return JSON.parse(await readFile("mcp-servers.json", "utf8"));
  } catch {
    return []; // no file: only your own server
  }
}
