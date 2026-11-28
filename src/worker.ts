import "dotenv/config";
import { claimNext, fail, finish, quarantine } from "./pipeline/jobs";
import { looksLikeInjection } from "./gateway/injection";
import { logEvent } from "./gateway/events";
import { replaceDocument } from "./services/ingestion.service";
import { withTenant } from "./services/usage";
import { clearCache } from "./rag/cache";
import { pool } from "./db/pool";

// Indexes queued documents in the background, so uploads return straight away.
// Run it with `npm run worker`. Pass --once to stop when the queue is empty.
const once = process.argv.includes("--once");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

while (true) {
  const job = await claimNext();
  if (!job) {
    if (once) break;
    await sleep(2000);
    continue;
  }
  // A document that gives orders to an AI is held back before it's indexed, because
  // once it's searchable, every answer that retrieves it carries the attack (episode 8).
  if (!job.reviewed && looksLikeInjection(job.content)) {
    await quarantine(job.id, "looks like a prompt injection");
    await logEvent(job.tenant_id, null, "quarantined", job.title);
    console.log(`${job.title}: quarantined for review`);
    continue;
  }
  try {
    // Bill the embedding calls to the job's tenant (episode 4)
    const saved = await withTenant(job.tenant_id, () =>
      replaceDocument(job.tenant_id, job.title, job.content, job.source)
    );
    if (saved > 0) await clearCache(job.tenant_id); // old cached answers may now be wrong
    await finish(job.id);
    console.log(
      `${job.title}: ${saved > 0 ? `${saved} chunks` : "unchanged, skipped"}`
    );
  } catch (error) {
    await fail(job, error);
    console.error(`${job.title}: failed (attempt ${job.attempts})`, error);
  }
}
await pool.end();
