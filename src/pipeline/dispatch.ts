import { CloudTasksClient } from "@google-cloud/tasks";

// On Google Cloud (episode 11), each queued job also becomes a Cloud Task. Cloud Tasks
// calls the private worker service to index it, with retries, backoff and a limit on
// how many run at once, so a big upload can't flood the embeddings API. Locally,
// with no TASKS_QUEUE set, nothing changes: npm run worker picks jobs up as before.
const queue = process.env.TASKS_QUEUE; // projects/P/locations/R/queues/Q
const workerUrl = process.env.WORKER_URL; // the worker service's https URL
const invoker = process.env.TASKS_INVOKER; // the service account Cloud Tasks signs as

let client: CloudTasksClient | undefined;

export const tasksEnabled = () => Boolean(queue && workerUrl && invoker);

// One Cloud Task: a POST to the worker service, made by Cloud Tasks with retries.
async function createTask(path: string, body: object) {
  client ??= new CloudTasksClient();
  await client.createTask({
    parent: queue,
    task: {
      httpRequest: {
        httpMethod: "POST",
        url: `${workerUrl}${path}`,
        headers: { "Content-Type": "application/json" },
        body: Buffer.from(JSON.stringify(body)).toString("base64"),
        // Cloud Tasks attaches a Google-signed token for this account. The worker
        // service only accepts requests from accounts allowed to invoke it.
        oidcToken: { serviceAccountEmail: invoker, audience: workerUrl },
      },
    },
  });
}

// A queued job: the worker indexes it.
export async function dispatch(jobId: number) {
  if (tasksEnabled()) await createTask("/internal/jobs/process", { jobId });
}

// An upload: the worker reads it from Cloud Storage and queues it.
export async function dispatchUpload(bucket: string, name: string) {
  await createTask("/internal/uploads", { bucket, name });
}
