# Ask my docs

The project you build in **[The AI-Ready Fresher](https://skillrazr.com/ai-ready-fresher)**, SkillRazr's free weekly series that takes freshers from using AI tools to working as AI engineers.

It starts as a semantic search service and grows a little every Sunday: a RAG app, then tools, agents, a UI, security, evals and deployment, until it is a production capstone you can show recruiters.

**Each episode is one commit, with a branch of the same name.** Build it yourself while you read the episode, and use this repo to check your work or to catch up if you get stuck.

| Episode | Branch | What the project can do after it |
| --- | --- | --- |
| [1. AI engineering foundations](https://skillrazr.com/ai-ready-fresher/1) | `episode-01` | Index Markdown files and search them by meaning with PostgreSQL and pgvector |
| [2. Your first RAG app](https://skillrazr.com/ai-ready-fresher/2) | `episode-02` | Answer questions from your documents with citations, say "not found" honestly, serve it as `POST /ask`, and score it with a test set |
| [3. Better RAG in production](https://skillrazr.com/ai-ready-fresher/3) | `episode-03` | Follow-up questions, hybrid search and reranking, a database table as a source, a background ingestion queue, an answer cache, one index shared by many tenants, and faithfulness scores |
| [4. LLM APIs, tool calling and MCP](https://skillrazr.com/ai-ready-fresher/4) | `episode-04` | Streamed answers, retries and timeouts, the cost of every LLM call per tenant, tools the model can call, and an MCP server (stdio and HTTP) that AI assistants and agents can connect to |

To see exactly what an episode added, compare it with the one before, for example [episode-03...episode-04](https://github.com/SkillRazr/ask-my-docs/compare/episode-03...episode-04).

To start from a given episode:

```bash
git clone https://github.com/SkillRazr/ask-my-docs.git
cd ask-my-docs
git checkout episode-04   # or any branch in the table
```

## Run it

You need Node.js 20 or later, Docker, and an OpenAI API key.

```bash
npm install
cp .env.example .env      # then put your OpenAI key in .env
npm run db                # starts PostgreSQL with pgvector
npm run migrate           # creates or upgrades the tables (safe to re-run)
npm run ingest            # queues the files in docs/
npm run ingest:db         # queues the rows of the faqs table
npm run worker -- --once  # indexes everything in the queue, then stops
npm run ask -- "How many days of leave do new joiners get?"
npm run ask -- --stream "Who approves work from home requests?"
npm run chat              # a terminal chat that understands follow-up questions
npm run assistant -- "Which documents mention the notice period?"   # tool calling
npm run eval              # scores retrieval, answers, faithfulness and refusals
npm run costs             # tokens, cost and latency per purpose, tenant and tool
npm run mcp:client        # starts the MCP server and calls its tools
npm run mcp:inspect       # opens the MCP Inspector in your browser
npm run dev               # starts the API on http://localhost:3000
```

Then ask the API a question:

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: default" \
  -d '{"question": "Who approves work from home requests?"}'
```

Stream an answer, or call the MCP server over HTTP (set `MCP_API_KEYS` in `.env` first):

```bash
curl -N -X POST http://localhost:3000/ask/stream \
  -H "Content-Type: application/json" \
  -d '{"question": "Who approves work from home requests?"}'

MCP_CLIENT_KEY=your-key npm run mcp:client -- --http
```

### Use it from Claude Desktop, VS Code or Cursor

Add the server to your MCP client's config, with the full path to this folder:

```json
{
  "mcpServers": {
    "ask-my-docs": {
      "command": "npx",
      "args": ["-y", "tsx", "/full/path/to/ask-my-docs/src/mcp-stdio.ts"],
      "env": { "MCP_TENANT_ID": "default" }
    }
  }
}
```

`docs/` holds a small sample company handbook. Replace it with your own notes or docs, then run `npm run ingest` again. Re-running replaces each file's old chunks.

## Project layout

```text
docs/                         documents to index
evals/rag-tests.json          test questions, with the document that should answer each
sql/schema.sql                the document_chunks table (episode 1)
sql/upgrade-episode-03.sql    tenants, keyword search, ingestion queue, cache, faqs table
sql/upgrade-episode-04.sql    llm_usage and tool_calls tables
src/db/                       PostgreSQL connection and migrations
src/services/                 LLM client (retries, timeouts), usage and cost, embeddings, chunking, ingestion, search
src/pipeline/jobs.ts          the ingestion queue
src/rag/                      rewrite, retrieve (hybrid), rerank, context, answer, cache, judge
src/rag/stream.ts             the streamed answer
src/tools/registry.ts         the read-only tools: search_docs, ask_docs, list_documents
src/mcp/                      the MCP server and its stdio transport
src/routes/ask.routes.ts      POST /ask and POST /ask/stream
src/routes/mcp.routes.ts      the MCP server over HTTP, at POST /mcp
src/app.ts, src/server.ts     the Express API
src/ingest.ts                 queue the files in a folder
src/ingest-db.ts              queue the rows of the faqs table
src/worker.ts                 index queued documents in the background
src/ask-docs.ts, src/chat.ts  ask from the terminal
src/assistant.ts              tool calling with the OpenAI API
src/mcp-stdio.ts              start the MCP server for a local client
src/mcp-client.ts             a small MCP client to test the server
src/costs.ts                  what the app spent
src/eval-rag.ts               score the pipeline on the test set
```

Never commit your `.env`. It holds your API key.
