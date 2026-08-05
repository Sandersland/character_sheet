import { Router } from "express";

import { parseClassFilterOr400 } from "@/lib/http/parse-class-param.js";
import { parseMaxSpellLevelOr400 } from "@/lib/http/parse-max-spell-level-param.js";
import { requireEditionOr400 } from "@/lib/http/parse-edition-param.js";
import { prisma } from "@/lib/core/prisma.js";
import { resolveEditionCatalog, withEditionOrShared } from "@/lib/rules/catalog-edition.js";
import { classesOf, SPELL_CLASS_MEMBERSHIP_SELECT } from "@/lib/spellcasting/spell-classes.js";

export const spellsRouter = Router();

/**
 * Feeds the spellcasting section's "learn from catalog" picker — same role
 * as GET /api/items feeds the inventory editor. Ordered by level then name
 * so the UI can group by level without sorting client-side.
 *
 * `?class=` and `?maxLevel=` stay OPTIONAL: the creation ceremony asks for
 * one class's legal band, while the sheet's picker legitimately wants
 * everything (within one edition). Server-applied so the eligibility rule —
 * on the class's list, inside the legal level band — has exactly one home
 * (#1377).
 *
 * `?edition=` is now REQUIRED (#1712, F3 of epic #1517 — reverses #1377's "no
 * `?edition=`"): Spell has carried an `edition` column since #1710, but this
 * route didn't filter by it until now, so a 2014 request could see a
 * 2024-only row. Same required-param shape as featsRouter/referenceRouter
 * (#1411/#1412): absent 400s, unrecognized 400s. `withEditionOrShared`
 * narrows the DB read to at-most-two-per-name candidates (an exact-edition
 * row and/or the shared NULL row); `resolveEditionCatalog` then collapses
 * each name to the single row the requesting edition resolves to, so a
 * genuine 2014/2024 fork never serves both rows under one name. Today's
 * catalog is ~109 EDITION_2024 rows plus a little 2014 content (#1710), so
 * `?edition=EDITION_2014` legitimately serves few/no leveled spells until the
 * 2014 content slices (#1713-#1721) land — expected, not a bug.
 *
 * `?class=` filters through the SpellClass join (#1711), not a scalar
 * column — `classMemberships.some` finds rows with at least one matching
 * membership row. The served JSON still flattens back to `classes:
 * string[]` via classesOf, so frontend/src/lib/newSpells.ts and
 * spellList.ts consume the response unchanged.
 */
spellsRouter.get("/spells", async (req, res) => {
  const edition = requireEditionOr400(req, res);
  if (edition === undefined) return;

  const classFilter = parseClassFilterOr400(req, res);
  if (!classFilter.ok) return;
  const levelFilter = parseMaxSpellLevelOr400(req, res);
  if (!levelFilter.ok) return;

  const rows = await prisma.spell.findMany({
    where: withEditionOrShared(
      {
        ...(classFilter.className ? { classMemberships: { some: { className: classFilter.className } } } : {}),
        ...(levelFilter.maxLevel === undefined ? {} : { level: { lte: levelFilter.maxLevel } }),
      },
      edition,
    ),
    include: SPELL_CLASS_MEMBERSHIP_SELECT,
    orderBy: [{ level: "asc" }, { name: "asc" }],
  });
  const spells = resolveEditionCatalog(rows, edition, (row) => row.name);

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
      classes: classesOf(row),
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
