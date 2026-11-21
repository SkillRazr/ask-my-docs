# Ask my docs

The project you build in **[The AI-Ready Fresher](https://skillrazr.com/ai-ready-fresher)**, SkillRazr's free weekly series that takes freshers from using AI tools to working as AI engineers.

It starts as a semantic search service and grows a little every Sunday: a RAG app, then tools, agents, a UI, security, evals and deployment, until it is a production capstone you can show recruiters.

**Each episode is one commit, with a branch of the same name.** Build it yourself while you read the episode, and use this repo to check your work or to catch up if you get stuck.

| Episode | Branch | What the project can do after it |
| --- | --- | --- |
| [1. AI engineering foundations](https://skillrazr.com/ai-ready-fresher/1) | `episode-01` | Index Markdown files and search them by meaning with PostgreSQL and pgvector |
| [2. Your first RAG app](https://skillrazr.com/ai-ready-fresher/2) | `episode-02` | Answer questions from your documents with citations, say "not found" honestly, serve it as `POST /ask`, and score it with a test set |
| [3. Better RAG in production](https://skillrazr.com/ai-ready-fresher/3) | `episode-03` | Follow-up questions, hybrid search and reranking, a database table as a source, a background ingestion queue, an answer cache, one index shared by many tenants, and faithfulness scores |

To see exactly what an episode added, compare it with the one before, for example [episode-02...episode-03](https://github.com/SkillRazr/ask-my-docs/compare/episode-02...episode-03).

To start from a given episode:

```bash
git clone https://github.com/SkillRazr/ask-my-docs.git
cd ask-my-docs
git checkout episode-03   # or any branch in the table
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
npm run chat              # a terminal chat that understands follow-up questions
npm run eval              # scores retrieval, answers, faithfulness and refusals
npm run dev               # starts the API on http://localhost:3000
```

Then ask the API a question:

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: default" \
  -d '{"question": "Who approves work from home requests?"}'
```

`docs/` holds a small sample company handbook. Replace it with your own notes or docs, then run `npm run ingest` again. Re-running replaces each file's old chunks.

## Project layout

```text
docs/                         documents to index
evals/rag-tests.json          test questions, with the document that should answer each
sql/schema.sql                the document_chunks table (episode 1)
sql/upgrade-episode-03.sql    tenants, keyword search, ingestion queue, cache, faqs table
src/db/                       PostgreSQL connection and migrations
src/services/                 LLM client, embeddings, chunking, ingestion, search
src/pipeline/jobs.ts          the ingestion queue
src/rag/                      rewrite, retrieve (hybrid), rerank, context, answer, cache, judge
src/routes/ask.routes.ts      POST /ask
src/app.ts, src/server.ts     the Express API
src/ingest.ts                 queue the files in a folder
src/ingest-db.ts              queue the rows of the faqs table
src/worker.ts                 index queued documents in the background
src/ask-docs.ts, src/chat.ts  ask from the terminal
src/eval-rag.ts               score the pipeline on the test set
```

Never commit your `.env`. It holds your API key.
