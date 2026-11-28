import { claimNext, fail, finish, quarantine } from "./jobs";
import { looksLikeInjection } from "../gateway/injection";
import { logEvent } from "../gateway/events";
import { replaceDocument } from "../services/ingestion.service";
import { withTenant } from "../services/usage";
import { clearCache } from "../rag/cache";

// Indexes the next job in the queue. Returns false when the queue is empty.
// The worker (episode 3) and the Cloud Function (episode 10) both use it.
export async function processNext(): Promise<boolean> {
  const job = await claimNext();
  if (!job) return false;
  // A document that gives orders to an AI is held back before it's indexed, because
  // once it's searchable, every answer that retrieves it carries the attack (episode 8).
  if (!job.reviewed && looksLikeInjection(job.content)) {
    await quarantine(job.id, "looks like a prompt injection");
    await logEvent(job.tenant_id, null, "quarantined", job.title);
    console.log(`${job.title}: quarantined for review`);
    return true;
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
  return true;
}
