import "dotenv/config";
import { search } from "./services/search.service";
import { pool } from "./db/pool";

const query = process.argv.slice(2).join(" ") || "How much time off do I get?";
const results = await search(query);

for (const row of results) {
  const title = row.metadata?.title ?? "Untitled";
  console.log(`${Number(row.similarity).toFixed(2)}  ${title}  ${row.content.slice(0, 80).replace(/\n/g, " ")}…`);
}
await pool.end();
