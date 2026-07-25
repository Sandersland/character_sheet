import { Router } from "express";

import { prisma } from "@/lib/core/prisma.js";

export const maneuversRouter = Router({ mergeParams: true });

// Feeds the resources section's "learn a maneuver" picker — same role as
// GET /api/spells for the spellbook. GrantedAbility rows (source "maneuver"),
// carrying the placement/action metadata the session UI routes on. Alphabetical.
maneuversRouter.get("/", async (_req, res) => {
  const maneuvers = await prisma.grantedAbility.findMany({
    where: { source: "maneuver" },
    orderBy: { name: "asc" },
  });

  res.json(
    maneuvers.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      placement: row.placement,
      actionSlot: row.actionSlot,
      saveAbility: row.saveAbility,
    }))
  );
});
