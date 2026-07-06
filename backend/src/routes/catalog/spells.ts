import { Router } from "express";

import { prisma } from "../../lib/prisma.js";

export const spellsRouter = Router();

// Feeds the spellcasting section's "learn from catalog" picker — same role
// as GET /api/items feeds the inventory editor. Ordered by level then name
// so the UI can group by level without sorting client-side.
spellsRouter.get("/spells", async (_req, res) => {
  const spells = await prisma.spell.findMany({
    orderBy: [{ level: "asc" }, { name: "asc" }],
  });

  res.json(
    spells.map((row) => ({
      id: row.id,
      name: row.name,
      level: row.level,
      school: row.school,
      castingTime: row.castingTime,
      range: row.range,
      duration: row.duration,
      description: row.description,
      concentration: row.concentration,
      ritual: row.ritual,
      classes: row.classes,
      effectKind: row.effectKind ?? undefined,
      effectDiceCount: row.effectDiceCount ?? undefined,
      effectDiceFaces: row.effectDiceFaces ?? undefined,
      effectModifier: row.effectModifier ?? undefined,
      damageType: row.damageType ?? undefined,
      attackType: row.attackType ?? undefined,
      saveAbility: row.saveAbility ?? undefined,
      upcastDicePerLevel: row.upcastDicePerLevel ?? undefined,
      cantripScaling: row.cantripScaling,
    }))
  );
});
