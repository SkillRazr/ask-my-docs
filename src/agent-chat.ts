import "dotenv/config";
import readline from "node:readline";
import { runAgent } from "./agent/agent";
import { forgetUser } from "./agent/memory";
import { pool } from "./db/pool";

// Chat with the agent in the terminal. It shows each tool call as it happens.
// npm run agent                          a new conversation
// npm run agent -- --conversation <id>   carry on an earlier one
// Type "forget me" to delete what it remembers about you, or "exit" to stop.
const tenantId = process.env.TENANT_ID ?? "default";
const userKey = process.env.USER_KEY ?? "me"; // a real signed-in user from episode 7
const flag = process.argv.indexOf("--conversation");
let conversationId: string | undefined =
  flag > -1 ? process.argv[flag + 1] : undefined;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "\nYou: ",
});
rl.prompt();

for await (const line of rl) {
  const message = line.trim();
  if (message === "exit") break;
  if (message === "forget me") {
    console.log(`Deleted ${await forgetUser(tenantId, userKey)} memories.`);
  } else if (message) {
    const result = await runAgent({
      message,
      tenantId,
      userKey,
      conversationId,
      onEvent: (event) => {
        if (event.type === "tool_call")
          console.log(`  [step ${event.step}] ${event.tool}(${event.args})`);
        if (event.type === "tool_result" && !event.ok)
          console.log(`  [step ${event.step}] ${event.tool} failed`);
      },
    });
    conversationId = result.conversationId;
    console.log(`Agent: ${result.answer}`);
    console.log(
      `  (${result.steps} steps, ${result.stopReason}, conversation ${conversationId})`
    );
  }
  rl.prompt();
}
rl.close();
await pool.end();
