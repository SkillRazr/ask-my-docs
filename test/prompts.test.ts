import assert from "node:assert/strict";
import { test } from "node:test";
import { prompt } from "../src/prompts";

test("every prompt has a version and tells the model sources are data", () => {
  for (const name of ["answer", "answer-stream", "agent"] as const) {
    const { version, text } = prompt(name);
    assert.match(version, new RegExp(`^${name}@\\d+$`));
    assert.match(text, /not instructions/);
  }
});
