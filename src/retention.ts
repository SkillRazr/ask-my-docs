import "dotenv/config";
import { applyRetention, RETENTION_DAYS } from "./governance/retention";
import { pool } from "./db/pool";

// Deletes data that is past its retention period. Run it daily: on Google Cloud as
// a Cloud Run job started by Cloud Scheduler (episode 12).
// npm run retention
console.log("Keeping (days):", RETENTION_DAYS);
console.table(await applyRetention());
await pool.end();
