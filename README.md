# Ask my docs

The project you build in **[The AI-Ready Fresher](https://skillrazr.com/ai-ready-fresher)**, SkillRazr's free weekly series that takes freshers from using AI tools to working as AI engineers.

It starts as a semantic search service and grows a little every Sunday: a RAG app, then tools, agents, a UI, security, evals and deployment, until it is a production capstone you can show recruiters.

**Each episode is one commit, with a branch of the same name.** Build it yourself while you read the episode, and use this repo to check your work or to catch up if you get stuck.

| Episode | Branch | What the project can do after it |
| --- | --- | --- |
| [1. AI engineering foundations](https://skillrazr.com/ai-ready-fresher/1) | `episode-01` | Index Markdown files and search them by meaning with PostgreSQL and pgvector |
| [2. Your first RAG app](https://skillrazr.com/ai-ready-fresher/2) | `episode-02` | Answer questions from your documents with citations, say "not found" honestly, serve it as `POST /ask`, and score it with a test set |

To see exactly what an episode added, compare it with the one before, for example [episode-01...episode-02](https://github.com/SkillRazr/ask-my-docs/compare/episode-01...episode-02).

To start from a given episode:

```bash
git clone https://github.com/SkillRazr/ask-my-docs.git
cd ask-my-docs
git checkout episode-02   # or any branch in the table
```

## Run it

You need Node.js 20 or later, Docker, and an OpenAI API key.

```bash
npm install
cp .env.example .env      # then put your OpenAI key in .env
npm run db                # starts PostgreSQL with pgvector and creates the table
npm run ingest            # indexes the files in docs/
npm run search -- "How much time off do I get?"
npm run ask -- "How many days of leave do new joiners get?"
npm run eval              # runs the test set in src/eval-rag.ts
npm run dev               # starts the API on http://localhost:3000
```

Then ask the API a question:

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Who approves work from home requests?"}'
```

`docs/` holds a small sample company handbook. Replace it with your own notes or docs, then run `npm run ingest` again. Re-running replaces each file's old chunks.

## Project layout

```text
docs/                         documents to index
sql/schema.sql                the document_chunks table
src/db/pool.ts                PostgreSQL connection
src/services/                 embedding, chunking, ingestion and search
src/rag/                      retrieve, build context, answer with citations
src/routes/ask.routes.ts      POST /ask
src/app.ts, src/server.ts     the Express API
src/ingest.ts                 index everything in docs/
src/search.ts                 search from the terminal
src/ask-docs.ts               ask a question from the terminal
src/eval-rag.ts               test set: answerable and unanswerable questions
```

Never commit your `.env`. It holds your API key.
