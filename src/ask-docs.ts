import "dotenv/config";
import { answerQuestion } from "./rag/answer";
import { pool } from "./db/pool";

// Usage: npm run ask -- "your question"
const question = process.argv.slice(2).join(" ") || "How many days of leave do new joiners get?";
const result = await answerQuestion({ question, tenantId: process.env.TENANT_ID ?? "default" });

console.log(result.answer);
for (const source of result.sources) {
  console.log(`[${source.number}] ${source.title} (relevance ${source.relevance}/10)`);
}
if (result.cached) console.log("(from cache)");
await pool.end();
