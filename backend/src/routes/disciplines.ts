import { Router } from "express";

import { prisma } from "../lib/prisma.js";
import { readEffectSpec } from "../lib/effects.js";
import { readAbilityCost } from "../lib/ability-cost.js";

export const disciplinesRouter = Router();

// Feeds the Four Elements monk's "learn a discipline" picker — same role as
// GET /api/maneuvers. Each row carries its min monk level, embedded ki cost
// (AbilityCost), and roll (EffectSpec). Ordered by min level then name.
disciplinesRouter.get("/disciplines", async (_req, res) => {
  const disciplines = await prisma.discipline.findMany({
    orderBy: [{ minLevel: "asc" }, { name: "asc" }],
  });

  res.json(
    disciplines.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      minLevel: row.minLevel,
      alwaysKnown: row.alwaysKnown,
      saveAbility: row.saveAbility,
      cost: readAbilityCost(row),
      effect: readEffectSpec({ ...row, level: 0 }),
    }))
  );
});
