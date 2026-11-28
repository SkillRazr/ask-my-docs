import assert from "node:assert/strict";
import { test } from "node:test";
import { can } from "../src/auth/rbac";
import { tools } from "../src/tools/registry";

test("each role can do exactly what it should", () => {
  assert.ok(can("viewer", "documents:read"));
  assert.ok(!can("viewer", "documents:write"));
  assert.ok(can("editor", "documents:write"));
  assert.ok(!can("editor", "users:manage"));
  assert.ok(can("admin", "users:manage"));
});

test("every tool that changes data needs the write permission", () => {
  for (const tool of tools.filter((t) => !t.readOnly))
    assert.equal(tool.permission, "documents:write", tool.name);
});
