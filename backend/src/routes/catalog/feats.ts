import { Router } from "express";

import { prisma } from "../../lib/prisma.js";

export const featsRouter = Router();

// Feeds the advancement section's feat picker — same role as GET /api/maneuvers.
// Ordered alphabetically server-side.
featsRouter.get("/feats", async (_req, res) => {
  const feats = await prisma.feat.findMany({
    orderBy: { name: "asc" },
  });

  res.json(
    feats.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      prerequisite: row.prerequisite ?? undefined,
      abilityOptions: row.abilityOptions,
      abilityIncrease: row.abilityIncrease,
      improvements: row.improvements,
    })),
  );
});
