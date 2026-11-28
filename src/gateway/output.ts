import { randomBytes } from "node:crypto";
import { redact, SECRET_KINDS } from "./pii";

// A random marker hidden in the agent's instructions. It means nothing to anyone, so
// if it ever appears in an answer, the model is repeating its instructions.
export const CANARY = `ref-${randomBytes(6).toString("hex")}`;

// Sensitive ids and secrets never leave in an answer, even if a document holds them.
// Emails and phone numbers stay: company documents list them on purpose.
const NEVER_SHOW = new Set([...SECRET_KINDS, "card", "aadhaar", "pan"]);

export function checkOutput(text: string) {
  if (text.includes(CANARY))
    return {
      text: "I can't share that.",
      blocked: true,
      found: ["instructions"],
    };
  const result = redact(text, NEVER_SHOW);
  return { text: result.text, blocked: false, found: result.found };
}
