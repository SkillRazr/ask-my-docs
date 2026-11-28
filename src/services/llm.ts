import OpenAI from "openai";
import "dotenv/config";

// One client for every call, so every call gets the same safety settings.
export const client = new OpenAI({
  // Retries rate limits (429), server errors (5xx), timeouts and dropped
  // connections, waiting longer each time. It never retries a 400: a bad request
  // stays bad however often you send it.
  maxRetries: 3,
  // Gives up on one attempt after 30 seconds instead of waiting for minutes.
  timeout: 30_000,
});

// The model that writes answers, and a cheaper one for small jobs (rewriting,
// reranking, judging). Both default to OPENAI_MODEL.
export const ANSWER_MODEL = process.env.OPENAI_MODEL!;
export const SMALL_MODEL = process.env.OPENAI_SMALL_MODEL || ANSWER_MODEL;
