import "dotenv/config";
import { answerQuestion } from "./rag/answer";
import { pool } from "./db/pool";

const question = process.argv.slice(2).join(" ") || "How many days of leave do new joiners get?";
const result = await answerQuestion(question);

console.log(result.answer);
for (const source of result.sources) {
  console.log(`[${source.number}] ${source.title} (similarity ${source.similarity.toFixed(2)})`);
}
await pool.end();
