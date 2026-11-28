import express from "express";
import { z } from "zod";
import { runAgent } from "../agent/agent";

export const agentRouter = express.Router();

const AgentBody = z.object({
  message: z.string().trim().min(1).max(1000),
  conversationId: z.uuid().optional(),
});

// The tenant and the user come from headers for now. Anyone can set a header, so
// this is NOT security: episode 7 takes both from the signed-in user.
agentRouter.post("/agent", async (req, res) => {
  const body = AgentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Send a message of up to 1000 characters." });
    return;
  }
  try {
    const result = await runAgent({
      ...body.data,
      tenantId: req.header("x-tenant-id") || "default",
      userKey: req.header("x-user-key") || "anonymous",
    });
    res.json(result);
  } catch (error) {
    console.error(error);
    res
      .status(502)
      .json({
        error: "The agent couldn't answer right now. Please try again.",
      });
  }
});
