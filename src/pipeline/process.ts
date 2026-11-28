import { claimNext, fail, finish, quarantine } from "./jobs";
import { looksLikeInjection } from "../gateway/injection";
import { logEvent } from "../gateway/events";
import { replaceDocument } from "../services/ingestion.service";
import { withTenant } from "../services/usage";
import { clearCache } from "../rag/cache";
import { announce } from "./events";

export type Outcome = "empty" | "indexed" | "quarantined" | "failed";

// Indexes the next job in the queue and says how it went. The worker (episode 3),
// the Cloud Function (episode 10) and the worker service (episode 11) all use it.
export async function processNext(): Promise<Outcome> {
  const job = await claimNext();
  if (!job) return "empty";
  // A document that gives orders to an AI is held back before it's indexed, because
  // once it's searchable, every answer that retrieves it carries the attack (episode 8).
  if (!job.reviewed && looksLikeInjection(job.content)) {
    await quarantine(job.id, "looks like a prompt injection");
    await logEvent(job.tenant_id, null, "quarantined", job.title);
    console.log(`${job.title}: quarantined for review`);
    await announce({
      type: "document.quarantined",
      tenantId: job.tenant_id,
      title: job.title,
    });
    return "quarantined";
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
    if (saved > 0)
      await announce({
        type: "document.indexed",
        tenantId: job.tenant_id,
        title: job.title,
        chunks: saved,
      });
    return "indexed";
  } catch (error) {
    await fail(job, error);
    console.error(`${job.title}: failed (attempt ${job.attempts})`, error);
    return "failed";
  }
}
