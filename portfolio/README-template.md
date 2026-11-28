# Ask my docs

Ask questions about your company's documents and get answers with sources, from a quick search or from an agent that can take several steps. Built with TypeScript, PostgreSQL with pgvector, the OpenAI API and MCP, deployed on Google Cloud Run.

**[Watch the 3-minute demo](https://link-to-your-video)** · **[Try it live](https://your-cloud-run-url)** (ask me for an invite)

![The web UI on a phone, answering a question with sources](screenshot.png)

## What it does

- **Answers with sources:** hybrid search (vectors and keywords), reranking, and citations you can click. Says "not found" instead of guessing.
- **An agent:** plans, calls tools over MCP, remembers each user, and asks for approval before it changes anything.
- **A web UI:** streamed answers, the agent's steps as they happen, and feedback, on phones and laptops.
- **Sign-in and roles:** Google sign-in, invited users with viewer, editor and admin roles, and tools per role.
- **Guardrails:** per-user rate limits and budgets, personal data redaction, prompt injection checks, output checks, and quarantine for suspicious documents.
- **Observability and evals:** OpenTelemetry traces, a Cloud Monitoring dashboard and alerts, and RAG and agent evals that run on every pull request.
- **Production on Google Cloud:** Cloud Run, Cloud SQL on a private IP, Secret Manager, a Cloud Function and Cloud Tasks for indexing, one service account per service.
- **Governance:** an append-only audit trail, automatic data retention, "download or delete my data" (India's DPDP Act), and versioned prompts.

## Architecture

```text
Browser ──► Cloud Run: app (Express, web UI) ──► OpenAI API
               │  gateway: limits, redaction, injection checks
               │  RAG pipeline and agent (MCP tools)
               ▼  Direct VPC egress
         Cloud SQL (PostgreSQL + pgvector, private IP)
               ▲
Cloud Storage ──► Cloud Function ──► Cloud Tasks ──► Cloud Run: worker (private)
Traces ► Cloud Trace · Logs ► Cloud Logging ► dashboard and alerts
```

## Results

Measured with the eval sets in `evals/`. Replace these with your own numbers.

| Eval | Score |
| --- | --- |
| Retrieval hit rate | X% |
| Answer correctness | X% |
| Faithfulness | X% |
| Correct refusals | X% |
| Agent tool use | X% |
| Agent safety | 100% |

Average cost per quick answer: $X. Average cost per agent answer: $X. p95 latency: X s.

## Run it locally

You need Node.js 22, Docker and an OpenAI API key.

```bash
npm install
cp .env.example .env      # add your OpenAI key
npm run db && npm run migrate
npm run users -- add you@gmail.com default admin
npm run ingest && npm run worker -- --once
npm run dev               # http://localhost:3000
```

## What I'd do next

- One or two honest sentences about what you'd improve, and why.

## Credits

Built by following [The AI-Ready Fresher](https://skillrazr.com/ai-ready-fresher) from SkillRazr, then extended with: (list what you added or changed yourself).
