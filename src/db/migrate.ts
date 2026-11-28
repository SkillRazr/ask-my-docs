import { readFile } from "node:fs/promises";
import { pool } from "./pool";

// Runs the SQL files in order. Every file is safe to run more than once.
const files = [
  "sql/schema.sql",
  "sql/upgrade-episode-03.sql",
  "sql/upgrade-episode-04.sql",
  "sql/upgrade-episode-05.sql",
  "sql/upgrade-episode-06.sql",
  "sql/upgrade-episode-07.sql",
];

for (const file of files) {
  await pool.query(await readFile(file, "utf8"));
  console.log(`Applied ${file}`);
}
await pool.end();
