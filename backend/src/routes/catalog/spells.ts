import { Router } from "express";

import { parseClassFilterOr400 } from "@/lib/http/parse-class-param.js";
import { parseMaxSpellLevelOr400 } from "@/lib/http/parse-max-spell-level-param.js";
import { requireEditionOr400 } from "@/lib/http/parse-edition-param.js";
import { prisma } from "@/lib/core/prisma.js";
import { classesOf, resolveSpellCatalogForEdition, SPELL_CLASS_MEMBERSHIP_SELECT } from "@/lib/spellcasting/spell-classes.js";

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
 * route didn't filter by it until now. Same required-param shape as
 * featsRouter/referenceRouter (#1411/#1412): absent 400s, unrecognized 400s.
 *
 * Resolution is NOT `withEditionOrShared` + `resolveEditionCatalog` (the
 * feats.ts/reference.ts pattern) — deliberately: those catalogs already have
 * full coverage on both editions, so a bare tag mismatch always means a
 * genuine edition-exclusive row there. The spell catalog does not have that
 * coverage yet (today's ~109 rows are ALL tagged EDITION_2024 with no 2014
 * counterpart), so that pattern would empty the picker for every 2014 caster
 * and block character creation outright. `resolveSpellCatalogForEdition`
 * (spell-classes.ts) is the spell-specific variant: same exact-then-shared
 * preference, but falls back to a name's only candidate rather than
 * excluding it — see that function's own comment for the full reasoning and
 * the e2e regression (creation.spec.ts's 2014 Warlock test) that caught the
 * stricter version. Still resolves a genuine 2014/2024 fork correctly (the
 * exact-match branch wins before the fallback ever runs); only a
 * single-edition-tagged name with no sibling — today's whole real catalog —
 * takes the graceful branch, until the 2014 content slices (#1713-#1721)
 * give it one.
 *
 * `?class=` filters through the SpellClass join (#1711), not a scalar
 * column, but — critically — AFTER edition resolution, not in the SQL
 * `where`. Filtering by `classMemberships.some` at the DB level would match
 * on whichever edition's row happens to carry that membership, which is
 * unsound the moment a name's two editions have genuinely DIFFERENT class
 * lists (#1715: 2014 Command is cleric+paladin only, but the 2024 SRD 5.2
 * revision added bard — a real one-of-a-kind divergence). Pre-filtering
 * would fetch only the 2024 row (the 2014 row has no bard membership to
 * match), and since it's then the group's ONLY candidate,
 * resolveSpellCatalogForEdition's graceful single-candidate fallback would
 * serve 2024 Command to a 2014 Bard's picker — exactly backwards. Resolving
 * first and filtering the RESOLVED row's own classesOf() list keeps the
 * class check scoped to the edition actually being served. The served JSON
 * still flattens back to `classes: string[]` via classesOf, so
 * frontend/src/lib/newSpells.ts and spellList.ts consume the response
 * unchanged.
 */
spellsRouter.get("/spells", async (req, res) => {
  const edition = requireEditionOr400(req, res);
  if (edition === undefined) return;

  const classFilter = parseClassFilterOr400(req, res);
  if (!classFilter.ok) return;
  const levelFilter = parseMaxSpellLevelOr400(req, res);
  if (!levelFilter.ok) return;

  const rows = await prisma.spell.findMany({
    where: levelFilter.maxLevel === undefined ? {} : { level: { lte: levelFilter.maxLevel } },
    include: SPELL_CLASS_MEMBERSHIP_SELECT,
    orderBy: [{ level: "asc" }, { name: "asc" }],
  });
  const resolved = resolveSpellCatalogForEdition(rows, edition);
  const spells = classFilter.className ? resolved.filter((row) => classesOf(row).includes(classFilter.className!)) : resolved;

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
