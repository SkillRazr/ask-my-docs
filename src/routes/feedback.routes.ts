import express from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requirePermission } from "../auth/middleware";
import { tenantOf, userOf } from "./identity";

export const feedbackRouter = express.Router();

const FeedbackBody = z.object({
  mode: z.enum(["ask", "agent"]),
  question: z.string().trim().min(1).max(1000),
  answer: z.string().max(10_000),
  rating: z.union([z.literal(1), z.literal(-1)]),
  comment: z.string().trim().max(1000).optional(),
});

// Thumbs up or down from the UI. Bad answers are your best new eval questions:
// episode 9 turns them into tests.
feedbackRouter.post(
  "/feedback",
  requirePermission("documents:read"),
  async (req, res) => {
    const body = FeedbackBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid feedback." });
      return;
    }
    const { mode, question, answer, rating, comment } = body.data;
    await pool.query(
      `INSERT INTO feedback (tenant_id, user_key, mode, question, answer, rating, comment)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        tenantOf(req),
        userOf(req),
        mode,
        question,
        answer,
        rating,
        comment ?? null,
      ]
    );
    res.status(201).json({ saved: true });
  }
);
