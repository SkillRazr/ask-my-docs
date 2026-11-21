import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { enqueue } from "./pipeline/jobs";
import { pool } from "./db/pool";

// Queues every Markdown or text file in a folder for the worker to index.
// Usage: npm run ingest -- [folder] [tenant]
const folder = process.argv[2] ?? "docs";
const tenantId = process.argv[3] ?? "default";
const files = (await readdir(folder)).filter((file) => /\.(md|txt)$/.test(file));

for (const file of files) {
  const text = (await readFile(`${folder}/${file}`, "utf8")).replace(/\r\n/g, "\n").trim();
  await enqueue(tenantId, file, "file", text);
}
console.log(`Queued ${files.length} files for tenant "${tenantId}". Run npm run worker to index them.`);
await pool.end();
