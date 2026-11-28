import "dotenv/config";
import { app } from "./app";
import { pool } from "./db/pool";

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () =>
  console.log(`Ask my docs is running on http://localhost:${port}`)
);

// Cloud Run sends SIGTERM before it stops an instance, then waits 10 seconds.
// Stop taking new requests, let the ones in progress finish, then close the
// database pool, so no answer is cut off halfway (episode 10).
process.once("SIGTERM", () => {
  console.log("SIGTERM: finishing requests in progress");
  server.close(() => void pool.end());
  // Streams can stay open for a long time. Don't wait past Cloud Run's deadline.
  setTimeout(() => process.exit(0), 8000).unref();
});
