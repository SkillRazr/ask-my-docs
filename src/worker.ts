import "dotenv/config";
import { processNext } from "./pipeline/process";
import { pool } from "./db/pool";

// Indexes queued documents in the background, so uploads return straight away.
// Run it with `npm run worker`. Pass --once to stop when the queue is empty.
// The work for each job is in pipeline/process.ts, shared with the Cloud Function
// that indexes uploads on Google Cloud (episode 10).
const once = process.argv.includes("--once");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

while (true) {
  if ((await processNext()) === "empty") {
    if (once) break;
    await sleep(2000);
  }
}
await pool.end();
