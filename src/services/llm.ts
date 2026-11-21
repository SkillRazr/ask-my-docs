import OpenAI from "openai";
import "dotenv/config";

export const client = new OpenAI();

// The model that writes answers, and a cheaper one for small jobs (rewriting,
// reranking, judging). Both default to OPENAI_MODEL.
export const ANSWER_MODEL = process.env.OPENAI_MODEL!;
export const SMALL_MODEL = process.env.OPENAI_SMALL_MODEL || ANSWER_MODEL;
