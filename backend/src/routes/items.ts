import { Router } from "express";

import { prisma } from "../lib/prisma.js";

export const itemsRouter = Router();

// Feeds the inventory editor's "add from catalog" picker (Phase B) — kept
// as its own endpoint rather than folded into GET /api/reference since the
// consumer is the character sheet, not the creation form (see reference.ts).
itemsRouter.get("/items", async (_req, res) => {
  const items = await prisma.item.findMany({ orderBy: { name: "asc" } });
  res.json(items);
});
