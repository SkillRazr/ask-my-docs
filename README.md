# Ask my docs

The project you build in **[The AI-Ready Fresher](https://skillrazr.com/ai-ready-fresher)**, SkillRazr's free weekly series that takes freshers from using AI tools to working as AI engineers.

It starts as a semantic search service and grows a little every Sunday: a RAG app, then tools, agents, a UI, security, evals and deployment, until it is a production capstone you can show recruiters.

**Each episode is one commit, with a tag.** Build it yourself while you read the episode, and use this repo to check your work or to catch up if you get stuck.

| Episode | Tag | What the project can do after it |
| --- | --- | --- |
| [1. AI engineering foundations](https://skillrazr.com/ai-ready-fresher/1) | `episode-01` | Index Markdown files and search them by meaning with PostgreSQL and pgvector |

To start from a given episode:

```bash
git clone https://github.com/SkillRazr/ask-my-docs.git
cd ask-my-docs
git checkout episode-01   # or any tag in the table
```

## Run it

You need Node.js 20 or later, Docker, and an OpenAI API key.

```bash
npm install
cp .env.example .env      # then put your OpenAI key in .env
npm run db                # starts PostgreSQL with pgvector and creates the table
npm run ingest            # indexes the files in docs/
npm run search -- "How much time off do I get?"
```

`docs/` holds a small sample company handbook. Replace it with your own notes or docs, then run `npm run ingest` again. Re-running replaces each file's old chunks.

## Project layout

```text
docs/                         documents to index
sql/schema.sql                the document_chunks table
src/db/pool.ts                PostgreSQL connection
src/services/                 embedding, chunking, ingestion and search
src/ingest.ts                 index everything in docs/
src/search.ts                 search from the terminal
```

Never commit your `.env`. It holds your API key.
