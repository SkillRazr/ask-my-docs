import { z } from "zod";
import { pool } from "../db/pool";
import { answerQuestion } from "../rag/answer";
import { retrieve } from "../rag/retrieve";
import { withTenant } from "../services/usage";

// Who is calling a tool. The tenant is decided by the server (from its config or an
// API key), never by the model: a tool argument can be anything the model writes.
export interface ToolContext {
  tenantId: string;
  caller: "mcp-stdio" | "mcp-http" | "assistant";
}

export interface Tool<Shape extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string; // the model reads this to decide when to call the tool
  input: z.ZodObject<Shape>;
  run(
    args: z.infer<z.ZodObject<Shape>>,
    context: ToolContext
  ): Promise<unknown>;
}

const defineTool = <Shape extends z.ZodRawShape>(tool: Tool<Shape>) => tool;

// A tool error the caller is allowed to see. Anything else is logged, and the caller
// only hears that the tool failed.
export class ToolError extends Error {}

// Every tool is read-only: it can look at a tenant's documents and never change them.
export const tools: Tool[] = [
  defineTool({
    name: "search_docs",
    title: "Search documents",
    description:
      "Search the user's documents by meaning and keywords. Returns the most relevant passages with their document titles. Use it to find facts or to see what the documents say about a topic.",
    input: z.object({
      query: z
        .string()
        .trim()
        .min(2)
        .max(300)
        .describe("What to look for, in plain words"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(10)
        .default(5)
        .describe("How many passages to return (1 to 10)"),
    }),
    async run({ query, limit }, { tenantId }) {
      const chunks = await retrieve(query, tenantId, limit);
      return chunks.map((chunk) => ({
        title: chunk.title,
        chunkId: chunk.id,
        text: chunk.content.slice(0, 600),
      }));
    },
  }),
  defineTool({
    name: "ask_docs",
    title: "Ask the documents",
    description:
      "Answer a question from the user's documents, with numbered citations. Says when the documents don't contain the answer. Prefer this over search_docs for direct questions.",
    input: z.object({
      question: z
        .string()
        .trim()
        .min(3)
        .max(500)
        .describe("A complete question"),
    }),
    async run({ question }, { tenantId }) {
      const result = await answerQuestion({ question, tenantId });
      return {
        found: result.found,
        answer: result.answer,
        sources: result.sources.map((s) => ({
          number: s.number,
          title: s.title,
        })),
      };
    },
  }),
  defineTool({
    name: "list_documents",
    title: "List documents",
    description:
      "List the titles of the documents that can be searched, with how many passages each has.",
    input: z.object({}),
    async run(_args, { tenantId }) {
      const { rows } = await pool.query(
        `SELECT COALESCE(metadata->>'title', 'Untitled') AS title, COUNT(*)::int AS passages
         FROM document_chunks WHERE tenant_id = $1
         GROUP BY 1 ORDER BY 1 LIMIT 200`,
        [tenantId]
      );
      return rows;
    },
  }),
];

// Tool results go into an LLM's context window, so keep them small.
const MAX_RESULT_CHARS = 8_000;

// The one way to run a tool, whoever asks: the MCP server and the assistant both use it.
// It validates the arguments, runs the tool for the caller's tenant, logs the call
// and returns the result as text.
export async function runTool(
  name: string,
  args: unknown,
  context: ToolContext
): Promise<string> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new ToolError(`Unknown tool: ${name}`);

  const parsed = tool.input.safeParse(args ?? {});
  if (!parsed.success) {
    throw new ToolError(
      `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("; ")}`
    );
  }

  const startedAt = Date.now();
  let error: string | null = null;
  try {
    const result = await withTenant(context.tenantId, () =>
      tool.run(parsed.data, context)
    );
    const text = JSON.stringify(result, null, 2);
    return text.length > MAX_RESULT_CHARS
      ? `${text.slice(0, MAX_RESULT_CHARS)}\n...(cut to ${MAX_RESULT_CHARS} characters)`
      : text;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    await pool
      .query(
        `INSERT INTO tool_calls (tenant_id, tool, caller, arguments, ok, error, latency_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          context.tenantId,
          name,
          context.caller,
          parsed.data,
          error === null,
          error,
          Date.now() - startedAt,
        ]
      )
      .catch((logError) =>
        console.error("Couldn't log the tool call:", logError)
      );
  }
}
