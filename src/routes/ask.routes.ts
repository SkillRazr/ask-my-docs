import express from "express";
import { z } from "zod";
import { answerQuestion } from "../rag/answer";
import { streamAnswer, type StreamEvent } from "../rag/stream";
import { tenantOf } from "./identity";

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

askRouter.post("/ask", async (req, res) => {
  const body = AskBody.safeParse(req.body);
  if (!body.success) {
    res
      .status(400)
      .json({ error: "Send a question between 3 and 500 characters." });
    return;
  }
  try {
    res.json(await answerQuestion({ ...body.data, tenantId: tenantOf(req) }));
  } catch (error) {
    console.error(error); // log the details for you, not for the user
    res
      .status(502)
      .json({ error: "Couldn't answer right now. Please try again." });
  }
});

// The same answer as Server-Sent Events: the browser gets each piece as it's written.
// Episode 6's web UI reads this endpoint.
askRouter.post("/ask/stream", async (req, res) => {
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
  const send = (event: StreamEvent) =>
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);

  // If the user closes the page, stop the LLM call: unread tokens still cost money.
  const abort = new AbortController();
  res.on("close", () => abort.abort());

  try {
    await streamAnswer(
      { ...body.data, tenantId: tenantOf(req) },
      send,
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
