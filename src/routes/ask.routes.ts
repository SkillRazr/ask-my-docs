import express from "express";
import { z } from "zod";
import { answerQuestion } from "../rag/answer";

export const askRouter = express.Router();

const AskBody = z.object({
  question: z.string().trim().min(3).max(500),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .max(20)
    .default([]),
});

askRouter.post("/ask", async (req, res) => {
  const body = AskBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Send a question between 3 and 500 characters." });
    return;
  }
  // For now the tenant comes from a header. Anyone can set a header, so this is NOT
  // security: episode 7 takes the tenant from the signed-in user instead.
  const tenantId = req.header("x-tenant-id") || "default";
  try {
    res.json(await answerQuestion({ ...body.data, tenantId }));
  } catch (error) {
    console.error(error); // log the details for you, not for the user
    res.status(502).json({ error: "Couldn't answer right now. Please try again." });
  }
});
