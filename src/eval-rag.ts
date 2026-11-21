import "dotenv/config";
import { readFile } from "node:fs/promises";
import { answerQuestion } from "./rag/answer";
import { retrieve } from "./rag/retrieve";
import { toStandaloneQuestion, type ChatTurn } from "./rag/rewrite";
import { judgeFaithfulness } from "./rag/judge";
import { clearCache } from "./rag/cache";
import { pool } from "./db/pool";

// source: the document that should be cited, or null if the answer isn't in your documents.
// history: earlier turns as [question, answer, question, answer, ...] for follow-up tests.
interface RagTest {
  question: string;
  source: string | null;
  history?: string[];
}

const tenantId = process.env.TENANT_ID ?? "default";
const tests: RagTest[] = JSON.parse(await readFile("evals/rag-tests.json", "utf8"));
await clearCache(tenantId); // measure the pipeline, not the cache

let retrievalHits = 0, answerable = 0, correct = 0, faithful = 0, refused = 0, unanswerable = 0;

for (const test of tests) {
  const history: ChatTurn[] = (test.history ?? []).map((content, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content,
  }));
  const result = await answerQuestion({ question: test.question, history, tenantId });
  let line: string;

  if (test.source === null) {
    unanswerable++;
    if (!result.found) refused++;
    line = result.found ? "FAIL answered, should refuse" : "PASS refused";
  } else {
    answerable++;
    // Retrieval: was the right document anywhere in the candidates?
    const standalone = await toStandaloneQuestion(test.question, history);
    const candidates = await retrieve(standalone, tenantId);
    if (candidates.some((c) => c.title === test.source)) retrievalHits++;

    const ok = result.found && result.sources.some((s) => s.title === test.source);
    if (ok) correct++;
    let note = "";
    if (result.found) {
      const verdict = await judgeFaithfulness(result.answer, result.sources);
      if (verdict.faithful) faithful++;
      else note = ` | unsupported: ${verdict.unsupported_claims.join("; ")}`;
    }
    line = `${ok ? "PASS" : "FAIL"} cited ${result.sources.map((s) => s.title).join(", ") || "nothing"}${note}`;
  }
  console.log(`${line} | ${test.question}`);
}

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${Math.round((100 * n) / d)}%`);
console.log(`
Retrieval hit rate:  ${pct(retrievalHits, answerable)}  (right document among the candidates)
Answer correctness:  ${pct(correct, answerable)}  (answered and cited the right document)
Faithfulness:        ${pct(faithful, correct)}  (answers fully supported by their sources)
Correct refusals:    ${pct(refused, unanswerable)}  (said "not found" when it should)`);
await pool.end();
