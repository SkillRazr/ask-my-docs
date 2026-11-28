import express from "express";
import { z } from "zod";
import { runAgent, type AgentEvent } from "../agent/agent";
import { tenantOf, userOf } from "./identity";

export const agentRouter = express.Router();

const AgentBody = z.object({
  message: z.string().trim().min(1).max(1000),
  conversationId: z.uuid().optional(),
});

agentRouter.post("/agent", async (req, res) => {
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
agentRouter.post("/agent/stream", async (req, res) => {
  const body = AgentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Send a message of up to 1000 characters." });
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
});
