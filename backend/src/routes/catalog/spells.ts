import { Router } from "express";

import { parseClassFilterOr400 } from "@/lib/http/parse-class-param.js";
import { parseMaxSpellLevelOr400 } from "@/lib/http/parse-max-spell-level-param.js";
import { prisma } from "@/lib/core/prisma.js";

export const spellsRouter = Router();

/**
 * Feeds the spellcasting section's "learn from catalog" picker — same role
 * as GET /api/items feeds the inventory editor. Ordered by level then name
 * so the UI can group by level without sorting client-side.
 *
 * `?class=` and `?maxLevel=` are OPTIONAL, unlike `?edition=` elsewhere: the
 * creation ceremony asks for one class's legal band, while the sheet's picker
 * legitimately wants everything. Server-applied so the eligibility rule — on the
 * class's list, inside the legal level band — has exactly one home (#1377).
 * No `?edition=` yet: Spell carries an `edition` column (#1710, foundation
 * for the 2014 catalog) but this route doesn't filter by it — every row
 * returns regardless of edition. Wiring `?edition=` in is F2/F3's job.
 */
spellsRouter.get("/spells", async (req, res) => {
  const classFilter = parseClassFilterOr400(req, res);
  if (!classFilter.ok) return;
  const levelFilter = parseMaxSpellLevelOr400(req, res);
  if (!levelFilter.ok) return;

  const spells = await prisma.spell.findMany({
    where: {
      ...(classFilter.className ? { classes: { has: classFilter.className } } : {}),
      ...(levelFilter.maxLevel === undefined ? {} : { level: { lte: levelFilter.maxLevel } }),
    },
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
