import { cloudEvent, type CloudEvent } from "@google-cloud/functions-framework";
import { dispatchUpload, tasksEnabled } from "../pipeline/dispatch";
import { indexUpload } from "../pipeline/uploads";

// A Cloud Function that runs whenever a file is uploaded to the bucket.
// Episode 10: it indexes the file itself, so it needs the database.
// Episode 11: the database is private, so the function only hands the upload to
// the private worker service through Cloud Tasks. It needs no database access and
// no VPC: the edge stays small, and the data stays inside.
interface StorageObjectData {
  bucket: string;
  name: string;
}

cloudEvent("ingestUpload", async (event: CloudEvent<StorageObjectData>) => {
  const { bucket, name } = event.data!;
  if (tasksEnabled()) await dispatchUpload(bucket, name);
  else await indexUpload(bucket, name);
});
