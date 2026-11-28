import express from "express";
import { z } from "zod";
import { processNext } from "../pipeline/process";
import { indexUpload } from "../pipeline/uploads";

// The worker service's only route (episode 11). Cloud Tasks calls it once per
// queued job. It isn't signed in like a user: the worker service is deployed with
// --no-allow-unauthenticated, so Cloud Run itself rejects any request without a
// Google-signed token from an account allowed to invoke it.
export const internalRouter = express.Router();

internalRouter.post("/internal/jobs/process", async (_req, res) => {
  const outcome = await processNext();
  // 500 tells Cloud Tasks to try again later, with backoff. The job was put back
  // in the queue by fail(), so the retry finds it.
  res.status(outcome === "failed" ? 500 : 200).json({ outcome });
});

// An upload handed on by the Cloud Function: read it from Cloud Storage and queue it.
const Upload = z.object({ bucket: z.string().min(1), name: z.string().min(1) });

internalRouter.post("/internal/uploads", async (req, res) => {
  const body = Upload.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Send a bucket and a name." }); // no retry
    return;
  }
  try {
    await indexUpload(body.data.bucket, body.data.name);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false }); // Cloud Tasks tries again
  }
});
