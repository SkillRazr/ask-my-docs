import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { chunkText } from "./services/chunking.service";
import { saveChunks } from "./services/ingestion.service";
import { pool } from "./db/pool";

const folder = process.argv[2] ?? "docs";
const files = (await readdir(folder)).filter((file) => /\.(md|txt)$/.test(file));

for (const file of files) {
  const text = (await readFile(`${folder}/${file}`, "utf8")).replace(/\r\n/g, "\n").trim();
  // Re-running replaces a file's old chunks instead of adding duplicates.
  await pool.query(`DELETE FROM document_chunks WHERE metadata->>'title' = $1`, [file]);
  const chunks = chunkText(text);
  await saveChunks(randomUUID(), chunks, { title: file });
  console.log(`${file}: ${chunks.length} chunks`);
}
await pool.end();
