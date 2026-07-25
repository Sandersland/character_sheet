import { Router } from "express";

import { readAbilityCost } from "@/lib/spellcasting/ability-cost.js";
import { shadowArtEffectSpec } from "@/lib/classes/shadow-arts.js";
import { prisma } from "@/lib/core/prisma.js";

export const shadowArtsRouter = Router({ mergeParams: true });

// Feeds the Warrior of Shadow monk's Shadow Arts picker — mirrors GET /api/maneuvers.
// Each row carries its embedded focus cost (AbilityCost) and flat EffectSpec.
shadowArtsRouter.get("/", async (_req, res) => {
  const arts = await prisma.grantedAbility.findMany({
    where: { source: "shadowArts" },
    orderBy: [{ name: "asc" }],
  });

  res.json(
    arts.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      minLevel: row.minLevel,
      cost: readAbilityCost(row),
      effect: shadowArtEffectSpec(row),
    })),
  );
});
