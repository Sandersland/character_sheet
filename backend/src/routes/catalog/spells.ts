import { Router } from "express";

import type { Spell } from "@/generated/prisma/client.js";
import { parseClassFilterOr400, parseSubclassIdParam } from "@/lib/http/parse-class-param.js";
import { parseMaxSpellLevelOr400 } from "@/lib/http/parse-max-spell-level-param.js";
import { requireEditionOr400 } from "@/lib/http/parse-edition-param.js";
import { prisma } from "@/lib/core/prisma.js";
import { classesOf, resolveSpellCatalogForEdition, SPELL_CLASS_MEMBERSHIP_SELECT } from "@/lib/spellcasting/spell-classes.js";
import { loadSubclassSpellListExpansionIds } from "@/lib/spellcasting/spell-list-expansion.js";

export const spellsRouter = Router();

// The nullable-on-Spell columns this route defaults to `undefined` on serve
// (never `null`, matching every other catalog route's wire shape) — named
// once and walked in a loop rather than one hand-written `?? undefined` per
// field, same shape custom-spells.ts's own EFFECT_FIELD_NAMES uses and for
// the same reason (see that file's comment): eight-plus individual `??`
// sites in one function is what crosses the complexity/CRAP ceiling.
// `saveEffect` (#1788, epic #1782 5/5) was missing here even though
// customSpellSchema/HomebrewSpellDamageFields have carried it since #1787 —
// the manage view's "Edit" prefill is the first caller that actually reads
// it back, and without it a saved "half damage on save" choice would
// silently vanish from the form on every edit.
//
// `ownerId` is NOT in this list any more (#1796 dropped the Spell column it
// read from) — it's computed separately in the route handler below, off the
// CatalogEntry a row's `catalogEntryId` resolves to, and passed into
// serializeCatalogSpellRow explicitly.
const UNDEFINED_DEFAULTED_FIELD_NAMES = [
  "effectKind",
  "effectDiceCount",
  "effectDiceFaces",
  "effectModifier",
  "damageType",
  "attackType",
  "saveAbility",
  "saveEffect",
  "upcastDicePerLevel",
] as const satisfies readonly (keyof Spell)[];
type UndefinedDefaultedFieldName = (typeof UNDEFINED_DEFAULTED_FIELD_NAMES)[number];
type UndefinedDefaultedFields = { [K in UndefinedDefaultedFieldName]: Spell[K] | undefined };

function undefinedDefaultedFields(row: Spell): UndefinedDefaultedFields {
  const out = {} as Record<UndefinedDefaultedFieldName, unknown>;
  for (const name of UNDEFINED_DEFAULTED_FIELD_NAMES) {
    out[name] = row[name] ?? undefined;
  }
  // Every value above came straight from Spell's own typed columns (or
  // undefined) — the single controlled cast back to the per-field union
  // UndefinedDefaultedFields declares, same rationale as custom-spells.ts's
  // own nullableEffectFields/undefinedEffectFields casts.
  return out as UndefinedDefaultedFields;
}

// `ownerId` is derived off the CatalogEntry a row's `catalogEntryId` resolves
// to (#1796 dropped the Spell column it used to read from), attached by the
// route handler below BEFORE resolution/serialization — resolveSpellCatalogForEdition
// still groups on it (see that function's own comment), so it has to exist on
// the row by the time these run, not just at response time.
type CatalogSpellRow = Spell & { classMemberships: { className: string }[]; ownerId: string | null };

// Present only on the caller's own homebrew (#1788) — every other row's
// ownerId is already resolved to null (seeded/GLOBAL) or the caller's own id
// (their USER-scope row) by the route handler's catalogEntry lookup, so this
// is the client's only signal for "mine, offer edit/delete" vs. seeded
// content; it never leaks another user's id.
function serializeCatalogSpellRow(row: CatalogSpellRow) {
  return {
    id: row.id,
    ownerId: row.ownerId ?? undefined,
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
    cantripScaling: row.cantripScaling,
    ...undefinedDefaultedFields(row),
  };
}

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
 *
 * `?subclassId=` (#1631) is a THIRD optional filter, applied alongside
 * `?class=`: a chosen subclass's SubclassSpellListExpansion widens the pool
 * with spells NOT on the class's own list (PHB'14 Warlock patrons — "Add
 * fiend spells to your warlock list"). Only ever WIDENS, never narrows —
 * absent or a subclass with no expansion rows is a no-op, matching
 * `?class=`'s own "no match still 200s with an empty/unwidened list" posture.
 * Ignored when `?class=` is absent (the unfiltered catalog already contains
 * everything a widening could add).
 *
 * The visibility filter (#1786, epic #1782 3/5; re-sourced off CatalogEntry
 * by #1796, epic #1795 1/6 — TEMPORARY, replaced by the read resolver in a
 * later slice) admits every GLOBAL entry plus the requesting user's own
 * USER-scope entries — never another user's homebrew. Two queries rather
 * than a nested Prisma filter: Spell.catalogEntryId carries no Prisma
 * relation (the supertype stays closed, see schema.prisma's own comment on
 * that column), so the visible catalogEntryId set has to be resolved first
 * and handed to a plain `catalogEntryId: { in: [...] }` filter. Each row is
 * then tagged with its resolved `ownerId` (null for GLOBAL, the caller's own
 * id for USER — never anyone else's, since the set was already scoped) before
 * flowing through the exact same resolution/class/level pipeline as before
 * (resolveSpellCatalogForEdition's grouping key still accounts for it — see
 * that function's own comment for the same-name collision case).
 * `spellsRouter` is mounted `"authed"` in routes/manifest.ts, so `req.user`
 * is always populated here.
 */
spellsRouter.get("/spells", async (req, res) => {
  const edition = requireEditionOr400(req, res);
  if (edition === undefined) return;

  const classFilter = parseClassFilterOr400(req, res);
  if (!classFilter.ok) return;
  const levelFilter = parseMaxSpellLevelOr400(req, res);
  if (!levelFilter.ok) return;
  const subclassFilter = parseSubclassIdParam(req, res);
  if (!subclassFilter.ok) return;

  const visibleEntries = await prisma.catalogEntry.findMany({
    where: { kind: "SPELL", OR: [{ scope: "GLOBAL" }, { scope: "USER", ownerUserId: req.user!.id }] },
    select: { id: true, ownerUserId: true },
  });
  const ownerIdByCatalogEntryId = new Map(visibleEntries.map((e) => [e.id, e.ownerUserId]));

  const rows = await prisma.spell.findMany({
    where: {
      catalogEntryId: { in: [...ownerIdByCatalogEntryId.keys()] },
      ...(levelFilter.maxLevel === undefined ? {} : { level: { lte: levelFilter.maxLevel } }),
    },
    include: SPELL_CLASS_MEMBERSHIP_SELECT,
    orderBy: [{ level: "asc" }, { name: "asc" }],
  });
  const owned = rows.map((row) => ({ ...row, ownerId: ownerIdByCatalogEntryId.get(row.catalogEntryId) ?? null }));
  const resolved = resolveSpellCatalogForEdition(owned, edition);
  const expandedSpellIds = classFilter.className
    ? new Set(await loadSubclassSpellListExpansionIds(subclassFilter.subclassId, edition))
    : new Set<string>();
  const spells = classFilter.className
    ? resolved.filter((row) => classesOf(row).includes(classFilter.className!) || expandedSpellIds.has(row.id))
    : resolved;

  res.json(spells.map(serializeCatalogSpellRow));
});
