import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// MCP clients such as Claude Desktop start this file from their own folder, not
// from the project, so load .env by its full path before anything reads it.
config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
await import("./mcp/stdio");
