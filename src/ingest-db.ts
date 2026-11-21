import "dotenv/config";
import { enqueue } from "./pipeline/jobs";
import { pool } from "./db/pool";

// Turns rows of a business table into documents. Each FAQ row becomes one small
// document titled "faq-<id>", so answers can cite the exact row.
const { rows } = await pool.query(
  `SELECT id, tenant_id, question, answer FROM faqs ORDER BY id`
);

for (const row of rows) {
  await enqueue(row.tenant_id, `faq-${row.id}`, "database", `# ${row.question}\n\n${row.answer}`);
}
console.log(`Queued ${rows.length} FAQ rows. Run npm run worker to index them.`);
await pool.end();
