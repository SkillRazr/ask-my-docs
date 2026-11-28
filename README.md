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
| [5. AI agents and memory](https://skillrazr.com/ai-ready-fresher/5) | `episode-05` | An agent that plans and calls tools in several steps through MCP, knows when to stop, remembers conversations and facts about each user, and can read images |
| [6. Project: an end-to-end AI app](https://skillrazr.com/ai-ready-fresher/6) | `episode-06` | A web UI at http://localhost:3000 with streamed answers, the agent's steps as they happen, clickable sources and thumbs-up feedback, on phones and laptops |
| [7. Identity, RBAC and agent permissions](https://skillrazr.com/ai-ready-fresher/7) | `episode-07` | Sign in with Google (OpenID Connect) and session JWTs, invited users with viewer, editor and admin roles, tools per role, and an approval step before the agent changes anything |
| [8. Agent gateways, guardrails and policy](https://skillrazr.com/ai-ready-fresher/8) | `episode-08` | A gateway in front of every LLM route: per-user rate limits and daily budgets, personal data redaction, prompt injection checks, policy rules for tool calls, output checks, and quarantine for suspicious documents |
| [9. Observability and agent evaluation](https://skillrazr.com/ai-ready-fresher/9) | `episode-09` | Traces of every request, agent step, tool call and LLM call (locally in Jaeger, or in Cloud Trace), structured logs, a Cloud Monitoring dashboard and alerts, agent evals for tool use, answers and safety, and evals that fail a pull request in CI |
| [10. Deploy on Cloud Run and Cloud Functions](https://skillrazr.com/ai-ready-fresher/10) | `episode-10` | A Docker image built by Cloud Build, the API and web UI live on Cloud Run with Cloud SQL and Secret Manager, a Cloud Function that indexes documents uploaded to Cloud Storage, and an optional self-hosted model |
| [11. Networking and scaling on Google Cloud](https://skillrazr.com/ai-ready-fresher/11) | `episode-11` | Cloud SQL on a private IP in a VPC, Direct VPC egress, one service account per service with access to single secrets, autoscaling tuned with a load test, a private worker fed by Cloud Tasks, document events on Pub/Sub, and a teardown script |

To see exactly what an episode added, compare it with the one before, for example [episode-10...episode-11](https://github.com/SkillRazr/ask-my-docs/compare/episode-10...episode-11).

To start from a given episode:

```bash
git clone https://github.com/SkillRazr/ask-my-docs.git
cd ask-my-docs
git checkout episode-11   # or any branch in the table
```

## Run it

You need Node.js 20 or later, Docker, and an OpenAI API key.

```bash
npm install
cp .env.example .env      # then put your OpenAI key in .env
npm run db                # starts PostgreSQL with pgvector
npm run migrate           # creates or upgrades the tables (safe to re-run)
npm run users -- add you@gmail.com default admin   # invite yourself first
npm run ingest            # queues the files in docs/
npm run ingest:db         # queues the rows of the faqs table
npm run worker -- --once  # indexes everything in the queue, then stops
npm run ask -- "How many days of leave do new joiners get?"
npm run ask -- --stream "Who approves work from home requests?"
npm run chat              # a terminal chat that understands follow-up questions
npm run assistant -- "Which documents mention the notice period?"   # tool calling
npm run agent             # chat with the agent: memory, several steps, tool calls shown
npm run describe -- photo.png "What does this say?"                  # read an image
npm run eval              # scores retrieval, answers, faithfulness and refusals
npm run eval:agent        # scores the agent's tool use, answers and safety
npm run feedback          # turns thumbs-down answers into new test cases to review
npm run costs             # tokens, cost and latency per purpose, tenant and tool
npm run guardrails        # what the gateway blocked, top spenders, documents held for review
npm run mcp:client        # starts the MCP server and calls its tools
npm run mcp:inspect       # opens the MCP Inspector in your browser
npm run dev               # starts the API and the web UI on http://localhost:3000 (sign in first)
```

To see traces, start Jaeger and run the app with `TRACE_EXPORTER=otlp`, then open http://localhost:16686:

```bash
docker run -d --name jaeger -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one
TRACE_EXPORTER=otlp npm run dev
```

On Google Cloud, use `TRACE_EXPORTER=gcp` and run `monitoring/setup.sh` once to create the log-based metrics, the dashboard and the alerts.

## Deploy it to Google Cloud

Episode 10 walks through every step: Cloud SQL, Secret Manager, Artifact Registry, Cloud Run, the migrate job, and the Cloud Function that indexes uploads. Once that's set up, each new version is one command:

```bash
gcloud builds submit --config cloudbuild.yaml
```

To try the production image on your laptop first:

```bash
docker build -t ask-my-docs .
docker run --rm -p 8080:8080 --env-file .env --add-host=host.docker.internal:host-gateway \
  -e DATABASE_URL=postgres://postgres:postgres@host.docker.internal:5432/postgres \
  -e APP_URL=http://localhost:8080 ask-my-docs
```

The Cloud Function is built by `npm run build` into `dist/function`, and deployed from there:

```bash
npm run build
gcloud functions deploy ingest-upload --gen2 --region=asia-south1 --runtime=nodejs22 \
  --source=dist/function --entry-point=ingestUpload \
  --trigger-bucket=YOUR_BUCKET --set-secrets=...   # see episode 10
```

Episode 11 moves the database to a private IP and indexing to a private worker service fed by Cloud Tasks. When you're done, `deploy/teardown.sh` deletes everything (or delete the whole project).

Open http://localhost:3000 and sign in. With `AUTH_DEV_LOGIN=true` you can type an invited email instead of setting up Google. To call the API from the terminal, sign in once and keep the cookie:

```bash
curl -c cookies.txt -X POST http://localhost:3000/auth/dev-login \
  -H "Content-Type: application/json" \
  -d '{"email": "you@gmail.com"}'

curl -b cookies.txt -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Who approves work from home requests?"}'
```

Stream an answer, or call the MCP server over HTTP (set `MCP_API_KEYS` in `.env` first):

```bash
curl -b cookies.txt -N -X POST http://localhost:3000/ask/stream \
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

Or ask the agent over the API:

```bash
curl -b cookies.txt -X POST http://localhost:3000/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "Compare the leave for interns and new joiners"}'
```

To give the agent more tools, copy `mcp-servers.example.json` to `mcp-servers.json` and list the MCP servers it may use, with the tools it may call from each.

`docs/` holds a small sample company handbook. Replace it with your own notes or docs, then run `npm run ingest` again. Re-running replaces each file's old chunks.

## Project layout

```text
docs/                         documents to index
evals/rag-tests.json          test questions, with the document that should answer each
evals/agent-tests.json        agent tasks, with the tools each should and shouldn't call
evals/guard-tests.json        attacks the gateway should block, and safe questions it should let through
monitoring/                   log-based metrics, dashboard and alerts for Cloud Monitoring
Dockerfile, .dockerignore     the production image for Cloud Run
cloudbuild.yaml               build, migrate and deploy on Google Cloud
scripts/build.mjs             bundles the server, jobs and Cloud Function with esbuild
deploy/teardown.sh            deletes everything episodes 10 and 11 created on Google Cloud
.github/workflows/evals.yml   runs both evals on every pull request
sql/schema.sql                the document_chunks table (episode 1)
sql/upgrade-episode-03.sql    tenants, keyword search, ingestion queue, cache, faqs table
sql/upgrade-episode-04.sql    llm_usage and tool_calls tables
sql/upgrade-episode-05.sql    conversations, messages, memories, agent_runs
sql/upgrade-episode-06.sql    feedback from the web UI
sql/upgrade-episode-07.sql    users and their roles, and actions waiting for approval
sql/upgrade-episode-08.sql    spend per user, guardrail events, rate limits, document review
public/                       the web UI: index.html, styles.css, app.js (no build step)
src/db/                       PostgreSQL connection and migrations
src/services/                 LLM client (retries, timeouts), usage and cost, embeddings, chunking, ingestion, search
src/pipeline/jobs.ts          the ingestion queue
src/rag/                      rewrite, retrieve (hybrid), rerank, context, answer, cache, judge
src/rag/stream.ts             the streamed answer
src/tools/registry.ts         the read-only tools: search_docs, ask_docs, list_documents
src/mcp/                      the MCP server and its stdio transport
src/agent/                    the agent loop, its toolbox (MCP clients) and memory
src/routes/ask.routes.ts      POST /ask and POST /ask/stream
src/routes/mcp.routes.ts      the MCP server over HTTP, at POST /mcp
src/routes/agent.routes.ts    POST /agent, POST /agent/stream and POST /agent/actions/:id
src/routes/passages.routes.ts GET /passages/:id, one source passage
src/routes/feedback.routes.ts POST /feedback
src/routes/identity.ts        who is asking: the signed-in user
src/routes/auth.routes.ts     sign in with Google, local sign-in for development, sign out
src/routes/admin.routes.ts    invite users and set roles (admins only)
src/auth/                     roles and permissions, session tokens, Google sign-in, middleware
src/agent/approvals.ts        actions the agent wants to take, waiting for the user
src/gateway/                  rate limits and budgets, PII redaction, injection checks, tool policy, output checks
src/guardrails.ts             the guardrails report, and releasing quarantined documents
src/users.ts                  manage users from the terminal
src/app.ts, src/server.ts     the Express API
src/ingest.ts                 queue the files in a folder
src/ingest-db.ts              queue the rows of the faqs table
src/worker.ts                 index queued documents in the background
src/pipeline/process.ts       index one queued document (used by the worker and the function)
src/functions/ingest-upload.ts  the Cloud Function that indexes uploads to Cloud Storage
src/pipeline/dispatch.ts      hands queued jobs and uploads to Cloud Tasks
src/pipeline/uploads.ts       reads an upload from Cloud Storage and queues it
src/pipeline/events.ts        announces indexed documents on Pub/Sub
src/routes/internal.routes.ts the private worker service's route, called by Cloud Tasks
src/ask-docs.ts, src/chat.ts  ask from the terminal
src/assistant.ts              tool calling with the OpenAI API
src/agent-chat.ts             chat with the agent in the terminal
src/describe-image.ts         ask a question about an image
src/mcp-stdio.ts              start the MCP server for a local client
src/mcp-client.ts             a small MCP client to test the server
src/costs.ts                  what the app spent
src/eval-rag.ts               score the pipeline on the test set
src/eval-agent.ts             score the agent on its test set
src/feedback-review.ts        turn negative feedback into draft test cases
src/telemetry.ts              OpenTelemetry: starts tracing before the app loads
src/observability.ts          spans and structured JSON logs
```

Never commit your `.env`. It holds your API key.
