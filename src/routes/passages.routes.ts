import express from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requirePermission } from "../auth/middleware";
import { tenantOf } from "./identity";

export const passagesRouter = express.Router();

// One indexed passage, so the UI can show what a source actually says. The tenant
// check matters: a passage id from another tenant must look like one that doesn't exist.
passagesRouter.get(
  "/passages/:id",
  requirePermission("documents:read"),
  async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: "Passage not found." });
      return;
    }
    const { rows } = await pool.query(
      `SELECT id, COALESCE(metadata->>'title', 'Untitled') AS title, content
     FROM document_chunks WHERE id = $1 AND tenant_id = $2`,
      [id.data, tenantOf(req)]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Passage not found." });
      return;
    }
    res.json(rows[0]);
  }
);
