# Ask my docs: runbook

What to do when something goes wrong in production. Start at the alert or symptom you have, follow the steps in order, and write down what you did in the incident notes at the end.

**Where things are**

- App: Cloud Run service `ask-my-docs`. Worker: `ask-my-docs-worker`. Uploads: function `ingest-upload`.
- Database: Cloud SQL `ask-my-docs-db`, private IP only.
- Dashboard: Monitoring > Dashboards > Ask my docs.
- Logs: Logs Explorer, filter `jsonPayload.message="request"` (or `"agent run"`, `"llm call"`, `"guardrail"`, `"audit"`).
- Traces: Trace explorer. Every log line links to its trace.
- Audit trail: the `audit_log` table.

## First five minutes, for any incident

1. Open the dashboard. Is it errors, latency, cost or guardrails?
2. Check what changed: `gcloud run revisions list --service=ask-my-docs --limit=3`. A deploy in the last hour is the most likely cause.
3. If a deploy is the likely cause, roll back first and investigate after:
   `gcloud run services update-traffic ask-my-docs --to-revisions=PREVIOUS_REVISION=100`
4. Check the providers: status.openai.com and the Google Cloud status page.
5. Tell users if it affects them, and say when you'll update them next.

## Alert: server errors (5xx)

1. In Logs Explorer, filter `jsonPayload.message="request" AND severity=ERROR`. Which route?
2. Open the trace of one failing request. Which span failed?
   - **`pg` spans failing, "too many clients":** instances times `DB_POOL_MAX` is over the limit. Lower `--max-instances` or the pool size now, resize the database later.
   - **`pg` spans failing, connection errors:** check the database in the Cloud SQL console. If it's stopped (`activation-policy NEVER`), start it.
   - **`llm` spans failing with 401:** the OpenAI key was revoked or rotated. Check the `openai-api-key` secret's latest version.
   - **`llm` spans failing with 429 or 5xx:** the provider is limiting or down. The client already retries. If it lasts, tell users, and consider a fallback model.
3. If none of these, roll back to the last revision that worked.

## Alert: agent hitting its step limit

1. Filter `jsonPayload.message="agent run" AND jsonPayload.stopReason="max_steps"`.
2. Open a few traces. Is the agent calling the same tool again and again?
3. Check the prompt version: `SELECT prompt_version, stop_reason, count(*) FROM agent_runs WHERE created_at > NOW() - INTERVAL '1 day' GROUP BY 1, 2`. If a new version started it, roll back with `PROMPT_VERSIONS=agent=N` and redeploy.
4. Check the model: a provider changing an unpinned model alias can change tool use overnight. Pin a dated snapshot.

## Symptom: answers are slow

1. Dashboard: p95 latency by route. Which route?
2. Open a slow trace and find the longest span: usually an `llm` span, sometimes `llm rerank` retrying.
3. If the provider is slow, there's little to do but wait or switch model. If it's retries, check for 429s.
4. If cold starts (the first request after a quiet spell), consider `--min-instances=1`.

## Symptom: spend is higher than usual

1. Dashboard: LLM spend per hour, by purpose. Which purpose jumped?
2. `npm run guardrails` (or the same queries in Cloud SQL Studio): top spenders today.
3. One user: check their requests in the logs. A script? Lower their budget or remove access.
4. Everyone: was a prompt or model changed? Compare `prompt_version` costs in `llm_usage`.
5. As a last resort, lower `USER_DAILY_BUDGET_USD` for everyone and redeploy.

## Symptom: a document isn't searchable

1. Was it uploaded to `gs://BUCKET/<tenant>/<file>.md`? Check the function's logs for "skipped".
2. Cloud Tasks > `ingestion`: is the task there, retrying?
3. Worker logs: "quarantined for review"? Read the document, then `npm run guardrails -- release <id>`.
4. `SELECT status, error FROM ingestion_jobs ORDER BY id DESC LIMIT 10` for failures.

## Suspected attack or data leak

1. Don't delete anything: logs, traces and the audit trail are your evidence.
2. Filter logs for `jsonPayload.message="guardrail"`. Which kinds, which tenant?
3. `SELECT * FROM audit_log WHERE at > NOW() - INTERVAL '1 day' ORDER BY at DESC` for sign-ins, role changes and approvals.
4. If an account is compromised: remove it (`users remove`), and rotate `auth-secret` so every session ends.
5. If a key leaked: rotate it (see below), and check the provider's usage page.
6. If personal data may have leaked: tell your data protection contact today. Under India's DPDP Act, a personal data breach must be reported to the Data Protection Board and to the affected people.

## Routine tasks

- **Rotate a secret:** add a version (`gcloud secrets versions add NAME --data-file=-`), update both services so new instances start, revoke the old credential, then disable the old version.
- **A user asks for their data, or to be forgotten:** they can do it themselves under "My data". If they ask by email, an admin can do it for them with the same functions, and the audit trail records it.
- **Release a prompt:** add a new version in `src/prompts.ts`, run both evals, ship it. To roll back, set `PROMPT_VERSIONS`.
- **Retention:** the `retention` job runs daily from Cloud Scheduler. Check its last run in Cloud Run > Jobs.

## Incident notes

For every incident, write down: when it started, when you noticed, what users saw, what you did and when, the cause, and what you'll change so it doesn't happen again. Blame the system, not the person.
