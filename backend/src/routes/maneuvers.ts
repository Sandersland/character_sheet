import { Router } from "express";

import { prisma } from "../lib/prisma.js";

export const maneuversRouter = Router();

// Feeds the resources section's "learn a maneuver" picker — same role as
// GET /api/spells for the spellbook. Ordered alphabetically.
maneuversRouter.get("/maneuvers", async (_req, res) => {
  const maneuvers = await prisma.maneuver.findMany({
    orderBy: { name: "asc" },
  });

  res.json(
    maneuvers.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
    }))
  );
});
