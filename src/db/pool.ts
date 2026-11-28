import pg from "pg";
import "dotenv/config";
import { Connector, IpAddressTypes } from "@google-cloud/cloud-sql-connector";

// Each Cloud Run instance has its own pool, so the total number of connections is
// this times the number of instances. Keep it under what the database allows.
const max = Number(process.env.DB_POOL_MAX ?? 10);

// On your laptop: DATABASE_URL. On Google Cloud (episode 10): set
// INSTANCE_CONNECTION_NAME and the Cloud SQL connector opens an encrypted connection,
// allowed by IAM, with no IP allowlist to manage. DB_IP_TYPE=PRIVATE uses the
// instance's private IP inside your VPC instead (episode 11).
async function createPool() {
  const instance = process.env.INSTANCE_CONNECTION_NAME;
  if (!instance)
    return new pg.Pool({ connectionString: process.env.DATABASE_URL, max });

  const connector = new Connector();
  const options = await connector.getOptions({
    instanceConnectionName: instance,
    ipType:
      process.env.DB_IP_TYPE === "PRIVATE"
        ? IpAddressTypes.PRIVATE
        : IpAddressTypes.PUBLIC,
  });
  const pool = new pg.Pool({
    ...options,
    user: process.env.DB_USER ?? "app",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME ?? "askmydocs",
    max,
  });
  // The connector keeps refreshing its certificates. Stop it when the pool closes,
  // so scripts like migrate can exit.
  const end = pool.end.bind(pool) as () => Promise<void>;
  pool.end = (async () => {
    await end();
    connector.close();
  }) as typeof pool.end;
  return pool;
}

export const pool = await createPool();
