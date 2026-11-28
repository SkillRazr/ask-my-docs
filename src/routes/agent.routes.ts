import express from "express";
import { audit } from "../governance/audit";
import { z } from "zod";
import { runAgent, type AgentEvent } from "../agent/agent";
import { decide } from "../agent/approvals";
import { requirePermission } from "../auth/middleware";
import { roleOf, tenantOf, userOf } from "./identity";
import { guard } from "../gateway/middleware";

export const agentRouter = express.Router();

const AgentBody = z.object({
  message: z.string().trim().min(1).max(1000),
  conversationId: z.uuid().optional(),
});

const canRead = requirePermission("documents:read");

agentRouter.post("/agent", canRead, guard("message"), async (req, res) => {
  const body = AgentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Send a message of up to 1000 characters." });
    return;
  }
  try {
    const result = await runAgent({
      ...body.data,
      tenantId: tenantOf(req),
      userKey: userOf(req),
      role: roleOf(req),
    });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(502).json({
      error: "The agent couldn't answer right now. Please try again.",
    });
  }
});

// The same agent as Server-Sent Events, for the web UI: each step as it happens,
// then the answer as it's written, then a "done" event with the sources.
agentRouter.post(
  "/agent/stream",
  canRead,
  guard("message"),
  async (req, res) => {
    const body = AgentBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: "Send a message of up to 1000 characters." });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const send = (type: string, data: object) =>
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);

    // If the user closes the page or presses Stop, stop the run and its LLM calls.
    const abort = new AbortController();
    res.on("close", () => abort.abort());

    try {
      const result = await runAgent({
        ...body.data,
        tenantId: tenantOf(req),
        userKey: userOf(req),
        role: roleOf(req),
        signal: abort.signal,
        onEvent: (event: AgentEvent) => send(event.type, event),
      });
      send("done", result);
    } catch (error) {
      if (!abort.signal.aborted) {
        console.error(error);
        send("error", {
          message: "The agent couldn't answer right now. Please try again.",
        });
      }
    }
    res.end();
  }
);

// The user's answer to an approval_required event. decide() checks that the action
// is theirs, still pending and not expired, and that their role still allows it.
const DecisionBody = z.object({ approve: z.boolean() });

agentRouter.post("/agent/actions/:id", canRead, async (req, res) => {
  const id = z.uuid().safeParse(req.params.id);
  const body = DecisionBody.safeParse(req.body);
  if (!id.success || !body.success) {
    res.status(400).json({ error: 'Send {"approve": true} or false.' });
    return;
  }
  const decision = await decide(id.data, req.user!, body.data.approve);
  await audit({
    tenantId: req.user!.tenantId,
    actor: req.user!.id,
    action: `action.${decision.status}`,
    target: id.data,
  });
  const status =
    decision.status === "not_found"
      ? 404
      : decision.status === "forbidden"
        ? 403
        : 200;
  res.status(status).json(decision);
});
