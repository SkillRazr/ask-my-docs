# Resume lines for Ask my docs

Pick the version that fits your resume. Replace every X with a number you measured yourself, and keep only what you actually built and can explain in an interview.

## One line, for a projects section

Ask my docs: a production RAG and agent app in TypeScript (PostgreSQL/pgvector, OpenAI API, MCP, Google Cloud Run) with cited answers, a tool-using agent with human approval, Google sign-in with roles, guardrails, tracing, and evals in CI.

## Three bullets

- Built a document Q&A app with hybrid search, reranking and citations that scores X% answer correctness and X% faithfulness on a test set of X questions, with evals that run on every pull request.
- Added an agent that plans and calls tools through an MCP server, with per-role permissions, human approval before writes, and policy checks; agent evals cover tool use, answers and safety (100% required).
- Deployed on Google Cloud (Cloud Run, Cloud SQL on a private IP, Secret Manager, Cloud Tasks) with OpenTelemetry tracing, dashboards, alerts, an audit trail and DPDP-style data export and erasure.

## Five bullets, for a project-heavy resume

- Designed a RAG pipeline (query rewriting, hybrid vector and keyword search with pgvector, reranking, citations) reaching X% correctness at about $X per answer.
- Built an AI agent with tool calling over MCP, memory per user, step limits and loop detection, streamed to a mobile-friendly web UI.
- Secured it with Google OpenID Connect sign-in, role-based access, per-user rate limits and budgets, PII redaction, prompt injection checks and output checks.
- Instrumented every request, agent step and LLM call with OpenTelemetry and Cloud Monitoring alerts, and gated pull requests on unit tests and RAG and agent evals.
- Deployed to Google Cloud Run with Cloud SQL on a private IP, least-privilege service accounts and a Cloud Tasks indexing queue, at about $X a month.

## LinkedIn "Projects" description

Ask my docs answers questions about a company's documents, with sources. I built it over 12 weeks as a production system, not a demo: hybrid search and reranking, an agent that asks for approval before it changes anything, Google sign-in with roles, guardrails against prompt injection and data leaks, tracing and evals on every pull request, and a private deployment on Google Cloud. Demo video and code: (your links).
