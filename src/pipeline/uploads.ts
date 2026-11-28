import { Storage } from "@google-cloud/storage";
import { enqueue } from "./jobs";
import { processNext } from "./process";
import { tasksEnabled } from "./dispatch";
import { pool } from "../db/pool";

// Indexes a document uploaded to Cloud Storage as gs://BUCKET/<tenant>/<file>.md.
// Used by the Cloud Function (episode 10) and, from episode 11, by the private
// worker service, which can reach the database on its private IP.
// Only people you give write access to the bucket can upload, so the bucket's IAM
// decides who may add documents, the same way roles do in the app (episode 7).
const MAX_JOBS_PER_RUN = 20;
let storage: Storage | undefined;

export async function readFromStorage(bucket: string, name: string) {
  storage ??= new Storage();
  const [contents] = await storage.bucket(bucket).file(name).download();
  return contents;
}

export async function indexUpload(
  bucket: string,
  name: string,
  read: (bucket: string, name: string) => Promise<Buffer> = readFromStorage
) {
  const [tenantId, ...rest] = name.split("/");
  const title = rest.join("/");
  if (!title || !/\.(md|txt)$/.test(title)) {
    console.log(`${name}: skipped (expected <tenant>/<file>.md or .txt)`);
    return;
  }
  // A typo in the folder name would otherwise create a new, empty tenant.
  const { rowCount } = await pool.query(
    "SELECT 1 FROM users WHERE tenant_id = $1 LIMIT 1",
    [tenantId]
  );
  if (!rowCount) {
    console.warn(`${name}: skipped, no users in tenant "${tenantId}"`);
    return;
  }
  const text = (await read(bucket, name))
    .toString("utf8")
    .replace(/\r\n/g, "\n")
    .trim();
  await enqueue(tenantId, title, "file", text);

  // With Cloud Tasks (episode 11), enqueue has already handed the job on.
  if (tasksEnabled()) return;

  // Otherwise, index this upload and anything else waiting, up to a limit, so one
  // run can't go on until the function times out. Jobs left over wait for the next
  // upload or for npm run worker.
  for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
    if ((await processNext()) === "empty") break;
  }
}
