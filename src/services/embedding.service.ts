import { client } from "./llm";
import { recordUsage } from "./usage";

export const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 numbers per vector

export async function embed(texts: string[]) {
  const startedAt = Date.now();
  const res = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  await recordUsage(
    "embed",
    EMBEDDING_MODEL,
    res.usage.prompt_tokens,
    0,
    startedAt
  );
  return res.data.map((d) => d.embedding);
}
