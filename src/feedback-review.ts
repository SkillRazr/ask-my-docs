import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { pool } from "./db/pool";

// Turns thumbs down into draft test cases. Each bad answer is a real question your
// app got wrong, which makes it the best kind of test. A person still decides what
// the right answer is: fill in "source" (or null if the documents can't answer it),
// then move the case into evals/rag-tests.json.
// npm run feedback [days]
const days = Number(process.argv[2] ?? 7);
const { rows } = await pool.query(
  `SELECT DISTINCT ON (lower(question)) question, answer, mode, created_at
   FROM feedback
   WHERE rating = -1 AND created_at > NOW() - make_interval(days => $1)
   ORDER BY lower(question), created_at DESC`,
  [days]
);

const drafts = rows.map((row) => ({
  question: row.question,
  source: "TODO: the document that should answer it, or null",
  badAnswer: row.answer.slice(0, 300), // for context only: delete it when you add the case
}));
await writeFile(
  "evals/from-feedback.json",
  JSON.stringify(drafts, null, 2) + "\n"
);
console.log(
  `${drafts.length} thumbs down from the last ${days} days written to evals/from-feedback.json`
);
await pool.end();
