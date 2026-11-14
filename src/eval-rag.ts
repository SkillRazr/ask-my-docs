import "dotenv/config";
import { answerQuestion } from "./rag/answer";
import { pool } from "./db/pool";

// source: the document that should be cited, or null if the answer is not in your documents.
const tests: { question: string; source: string | null }[] = [
  { question: "How many days of leave do new joiners get?", source: "leave-policy.md" },
  { question: "Who approves work from home requests?", source: "remote-work.md" },
  { question: "What is the CEO's favourite cricket team?", source: null },
];

let passed = 0;
for (const test of tests) {
  const result = await answerQuestion(test.question);
  const ok =
    test.source === null
      ? !result.found
      : result.found && result.sources.some((s) => s.title === test.source);
  if (ok) passed++;
  console.log(ok ? "PASS" : "FAIL", "|", test.question, "|", result.answer.slice(0, 80));
}
console.log(`${passed} of ${tests.length} passed`);
await pool.end();
