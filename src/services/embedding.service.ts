import OpenAI from "openai";
import "dotenv/config";

const client = new OpenAI();
export const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 numbers per vector

export async function embed(texts: string[]) {
  const res = await client.embeddings.create({ model: EMBEDDING_MODEL, input: texts });
  return res.data.map((d) => d.embedding);
}
