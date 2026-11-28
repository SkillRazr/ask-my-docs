import { PubSub } from "@google-cloud/pubsub";

// Announces that a document changed, on a Pub/Sub topic (episode 11). The indexer
// doesn't know or care who listens: a notification service, analytics, a second
// index. Each subscriber gets its own copy of every message. With no PUBSUB_TOPIC
// set, it does nothing.
const topicName = process.env.PUBSUB_TOPIC;
let pubsub: PubSub | undefined;

export async function announce(event: {
  type: "document.indexed" | "document.quarantined";
  tenantId: string;
  title: string;
  chunks?: number;
}) {
  if (!topicName) return;
  pubsub ??= new PubSub();
  try {
    await pubsub.topic(topicName).publishMessage({
      json: event,
      attributes: { type: event.type, tenant: event.tenantId },
    });
  } catch (error) {
    // Indexing worked. A lost announcement shouldn't fail the job.
    console.error("Couldn't publish to Pub/Sub", error);
  }
}
