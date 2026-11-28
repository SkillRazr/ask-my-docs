import "dotenv/config";
import { answerQuestion } from "./rag/answer";
import { streamAnswer } from "./rag/stream";
import { pool } from "./db/pool";

// Usage: npm run ask -- "your question"
//        npm run ask -- --stream "your question"   (prints the answer as it's written)
const args = process.argv.slice(2);
const stream = args.includes("--stream");
const question =
  args.filter((a) => a !== "--stream").join(" ") ||
  "How many days of leave do new joiners get?";
const tenantId = process.env.TENANT_ID ?? "default";

if (stream) {
  await streamAnswer({ question, tenantId }, (event) => {
    if (event.type === "delta") process.stdout.write(event.text);
    if (event.type === "done") {
      console.log();
      for (const source of event.sources)
        console.log(`[${source.number}] ${source.title}`);
      if (event.found && event.sources.length === 0)
        console.log("(no valid citations: don't trust this answer)");
      if (event.cached) console.log("(from cache)");
    }
  });
} else {
  const result = await answerQuestion({ question, tenantId });
  console.log(result.answer);
  for (const source of result.sources) {
    console.log(
      `[${source.number}] ${source.title} (relevance ${source.relevance}/10)`
    );
  }
  if (result.cached) console.log("(from cache)");
}
await pool.end();
