import { cloudEvent, type CloudEvent } from "@google-cloud/functions-framework";
import { Storage } from "@google-cloud/storage";
import { enqueue } from "../pipeline/jobs";
import { processNext } from "../pipeline/process";
import { pool } from "../db/pool";

// A Cloud Function that indexes a document as soon as it's uploaded to Cloud Storage.
// Upload to gs://YOUR_BUCKET/<tenant>/<file>.md and the first folder is the tenant.
// Only people you give write access to the bucket can upload, so the bucket's IAM
// decides who may add documents, the same way roles do in the app (episode 7).
const storage = new Storage();
const MAX_JOBS_PER_RUN = 20;

interface StorageObjectData {
  bucket: string;
  name: string;
  size?: string;
}

export async function indexUpload(
  bucket: string,
  name: string,
  read: (bucket: string, name: string) => Promise<Buffer>
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

  // Index this upload and anything else waiting, up to a limit, so one run can't
  // go on until the function times out. Jobs left over wait for the next upload
  // or for npm run worker.
  for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
    if (!(await processNext())) break;
  }
}

cloudEvent("ingestUpload", async (event: CloudEvent<StorageObjectData>) => {
  const { bucket, name } = event.data!;
  await indexUpload(bucket, name, async (b, n) => {
    const [contents] = await storage.bucket(b).file(n).download();
    return contents;
  });
});
