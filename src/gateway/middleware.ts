import type express from "express";
import { withTenant } from "../services/usage";
import { logEvent } from "./events";
import { checkInjection } from "./injection";
import { overBudget, rateLimit } from "./limits";
import { redact } from "./pii";

// Removed from what users type before it reaches a model or a log. Emails stay,
// because people ask about contact addresses.
const REDACT_FROM_INPUT = new Set([
  "private_key",
  "api_key",
  "card",
  "aadhaar",
  "pan",
  "phone",
]);

// The gateway in front of every LLM route: limits, then input checks, in order of
// cost, so a request that will be refused anyway costs as little as possible.
// field is the body field holding the user's text ("question" or "message").
export const guard =
  (field: string): express.RequestHandler =>
  async (req, res, next) => {
    const user = req.user!; // requirePermission runs first
    const event = (kind: string, detail?: string) =>
      logEvent(user.tenantId, user.id, kind, detail);

    // 1. Rate limit: a few database rows, no LLM call.
    const wait = await rateLimit(user.id);
    if (wait > 0) {
      await event("rate_limited");
      res.setHeader("Retry-After", String(wait));
      res.status(429).json({
        error: `Too many questions at once. Try again in ${wait} seconds.`,
      });
      return;
    }

    // 2. Daily budget: what this user's calls cost today.
    if (await overBudget(user.id)) {
      await event("over_budget");
      res
        .status(429)
        .json({
          error: "You've reached today's limit. It resets at midnight UTC.",
        });
      return;
    }

    const text = req.body?.[field];
    if (typeof text === "string") {
      // 3. Personal data: removed, not refused, so the user still gets an answer.
      const redacted = redact(text, REDACT_FROM_INPUT);
      if (redacted.found.length) {
        req.body[field] = redacted.text;
        await event("pii_redacted", redacted.found.join(", "));
      }

      // 4. Prompt injection: refused, with a plain message.
      const reason = await withTenant(
        user.tenantId,
        () => checkInjection(redacted.text),
        user.id
      );
      if (reason) {
        await event("injection_blocked", reason);
        res.status(400).json({
          error:
            "That looks like an attempt to change how the assistant works, so it wasn't sent. Please ask a question about your documents.",
        });
        return;
      }
    }

    // Every LLM call made while handling this request is billed to this user.
    withTenant(user.tenantId, async () => next(), user.id);
  };
