import express from "express";
import { z } from "zod";
import { answerQuestion } from "../rag/answer";
import { streamAnswer, type StreamEvent } from "../rag/stream";
import { requirePermission } from "../auth/middleware";
import { tenantOf, userOf } from "./identity";
import { guard } from "../gateway/middleware";
import { checkOutput } from "../gateway/output";
import { logEvent } from "../gateway/events";

export const askRouter = express.Router();

const AskBody = z.object({
  question: z.string().trim().min(3).max(500),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(2000),
      })
    )
    .max(20)
    .default([]),
});

const canRead = requirePermission("documents:read");

// Checks an answer before it leaves, and records when it had to change it.
function checkAnswer(req: express.Request, text: string) {
  const checked = checkOutput(text);
  if (checked.found.length)
    void logEvent(
      tenantOf(req),
      userOf(req),
      checked.blocked ? "output_blocked" : "output_redacted",
      checked.found.join(", ")
    );
  return checked;
}

askRouter.post("/ask", canRead, guard("question"), async (req, res) => {
  const body = AskBody.safeParse(req.body);
  if (!body.success) {
    res
      .status(400)
      .json({ error: "Send a question between 3 and 500 characters." });
    return;
  }
  try {
    const result = await answerQuestion({
      ...body.data,
      tenantId: tenantOf(req),
    });
    res.json({ ...result, answer: checkAnswer(req, result.answer).text });
  } catch (error) {
    console.error(error); // log the details for you, not for the user
    res
      .status(502)
      .json({ error: "Couldn't answer right now. Please try again." });
  }
});

// The same answer as Server-Sent Events: the browser gets each piece as it's written.
// Episode 6's web UI reads this endpoint.
askRouter.post("/ask/stream", canRead, guard("question"), async (req, res) => {
  const body = AskBody.safeParse(req.body);
  if (!body.success) {
    res
      .status(400)
      .json({ error: "Send a question between 3 and 500 characters." });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event: StreamEvent | { type: "replace"; text: string }) =>
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);

  // The user has already seen the streamed text, so the output check runs at the end
  // and, if it changes anything, tells the UI to replace the answer (episode 8).
  let text = "";
  const onEvent = (event: StreamEvent) => {
    if (event.type === "delta") text += event.text;
    if (event.type === "done") {
      const checked = checkAnswer(req, text);
      if (checked.found.length) send({ type: "replace", text: checked.text });
    }
    send(event);
  };

  // If the user closes the page, stop the LLM call: unread tokens still cost money.
  const abort = new AbortController();
  res.on("close", () => abort.abort());

  try {
    await streamAnswer(
      { ...body.data, tenantId: tenantOf(req) },
      onEvent,
      abort.signal
    );
  } catch (error) {
    if (!abort.signal.aborted) {
      console.error(error);
      send({
        type: "error",
        message: "Couldn't finish the answer. Please try again.",
      });
    }
  }
  res.end();
});
