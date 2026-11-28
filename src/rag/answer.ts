import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { ANSWER_MODEL, client } from "../services/llm";
import { tracked, withTenant } from "../services/usage";
import { toStandaloneQuestion, type ChatTurn } from "./rewrite";
import { retrieve } from "./retrieve";
import { rerank, type RankedChunk } from "./rerank";
import { buildContext } from "./context";
import { getCached, setCached } from "./cache";
import { prompt } from "../prompts";

const ModelAnswer = z.object({
  found: z.boolean(),
  answer: z.string(),
  citations: z.array(z.number().int()),
});

export interface Source {
  number: number;
  title: string;
  chunkId: string;
  content: string;
  relevance: number;
}

export interface RagAnswer {
  found: boolean;
  answer: string;
  question: string; // the standalone question that was searched for
  sources: Source[];
  cached?: boolean;
}

export interface AskInput {
  question: string;
  tenantId: string;
  history?: ChatTurn[];
}

export const notFound = (question: string): RagAnswer => ({
  found: false,
  answer: "I couldn't find that in your documents.",
  question,
  sources: [],
});

// Steps 1 to 3, shared by the normal answer and the streaming one (stream.ts):
// rewrite the question, check the cache, then retrieve and rerank.
export async function prepare({ question, tenantId, history = [] }: AskInput) {
  const standalone = await toStandaloneQuestion(question, history);
  const cached = await getCached(tenantId, standalone);
  if (cached)
    return {
      standalone,
      cached: { ...cached, cached: true } as RagAnswer,
      chunks: [],
    };
  const candidates = await retrieve(standalone, tenantId);
  const chunks = await rerank(standalone, candidates);
  return { standalone, cached: null, chunks };
}

// Keeps only citation numbers that point at a real source, and turns them into sources.
export function toSources(
  citations: number[],
  chunks: RankedChunk[],
  used: number
): Source[] {
  const cited = [...new Set(citations)].filter((n) => n >= 1 && n <= used);
  return cited.map((n) => ({
    number: n,
    title: chunks[n - 1].title,
    chunkId: chunks[n - 1].id,
    content: chunks[n - 1].content,
    relevance: chunks[n - 1].relevance,
  }));
}

export function answerQuestion(input: AskInput): Promise<RagAnswer> {
  // Every LLM call inside is billed to this tenant (see services/usage.ts).
  return withTenant(input.tenantId, async () => {
    const { standalone, cached, chunks } = await prepare(input);
    if (cached) return cached;
    if (chunks.length === 0) return notFound(standalone); // nothing relevant: skip the LLM call

    // 4. Augment and generate, exactly as in episode 2
    const context = buildContext(chunks);
    const instructions = prompt("answer"); // versioned (episode 12)
    const response = await tracked(
      "answer",
      () =>
        client.responses.parse({
          model: ANSWER_MODEL,
          instructions: instructions.text,
          input: `Sources:\n${context.text}\n\nQuestion: ${standalone}`,
          max_output_tokens: 800,
          text: { format: zodTextFormat(ModelAnswer, "rag_answer") },
        }),
      instructions.version
    );

    const result = response.output_parsed;
    let answer = notFound(standalone);
    if (result?.found) {
      const sources = toSources(result.citations, chunks, context.used.length);
      if (sources.length > 0)
        answer = {
          found: true,
          answer: result.answer,
          question: standalone,
          sources,
        };
    }

    await setCached(input.tenantId, standalone, answer);
    return answer;
  });
}
