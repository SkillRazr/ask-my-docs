// Builds the app for production with esbuild: TypeScript in, plain JavaScript out.
// node_modules aren't bundled for the server (the Docker image installs them), but
// they are for the Cloud Function, so it can be deployed as one small file.
// npm run build
import { build } from "esbuild";
import { readFile, rm, writeFile } from "node:fs/promises";

const common = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  logLevel: "info",
  // Some packages still use require(); this lets them work inside an ES module.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
};

await rm("dist", { recursive: true, force: true });

// The API, the telemetry that loads before it, and the scripts that run as Cloud Run
// jobs from the same image: migrate, worker and users.
await build({
  ...common,
  entryPoints: {
    server: "src/server.ts",
    telemetry: "src/telemetry.ts",
    migrate: "src/db/migrate.ts",
    worker: "src/worker.ts",
    users: "src/users.ts",
  },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  packages: "external",
});

// The Cloud Function: everything in one file, except the Functions Framework,
// which Google Cloud installs from the function's own package.json.
await build({
  ...common,
  entryPoints: ["src/functions/ingest-upload.ts"],
  outfile: "dist/function/index.mjs",
  external: ["@google-cloud/functions-framework"],
});
const pkg = JSON.parse(await readFile("package.json", "utf8"));
await writeFile(
  "dist/function/package.json",
  JSON.stringify(
    {
      name: "ask-my-docs-ingest",
      type: "module",
      main: "index.mjs",
      engines: { node: ">=22" },
      dependencies: {
        "@google-cloud/functions-framework":
          pkg.dependencies["@google-cloud/functions-framework"],
      },
    },
    null,
    2
  ) + "\n"
);
