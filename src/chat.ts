import "dotenv/config";
import readline from "node:readline";
import { answerQuestion } from "./rag/answer";
import type { ChatTurn } from "./rag/rewrite";
import { pool } from "./db/pool";

// A terminal chat, so you can try follow-up questions. Type "exit" to stop.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "\nYou: " });
const history: ChatTurn[] = [];
rl.prompt();

for await (const line of rl) {
  const question = line.trim();
  if (question === "exit") break;
  if (question) {
    const result = await answerQuestion({ question, history, tenantId: process.env.TENANT_ID ?? "default" });
    if (result.question !== question) console.log(`(searched for: ${result.question})`);
    console.log(`Docs: ${result.answer}`);
    for (const source of result.sources) console.log(`  [${source.number}] ${source.title}`);
    history.push({ role: "user", content: question }, { role: "assistant", content: result.answer });
  }
  rl.prompt();
}
rl.close();
await pool.end();
