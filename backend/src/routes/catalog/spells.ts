import { Router } from "express";

import type { CatalogMeta, RulesEdition } from "@character-sheet/shared-types";

import type { Spell } from "@/generated/prisma/client.js";
import { parseCharacterIdParam, parseClassFilterOr400, parseSubclassIdParam } from "@/lib/http/parse-class-param.js";
import { parseMaxSpellLevelOr400 } from "@/lib/http/parse-max-spell-level-param.js";
import { requireEditionOr400 } from "@/lib/http/parse-edition-param.js";
import { assertCharacterAccess } from "@/lib/auth/access.js";
import { prisma } from "@/lib/core/prisma.js";
import { EMPTY_CAMPAIGN_ID_SET, isCatalogEntryEditable, resolveDmCampaignIds, resolveVisibleEntries, type CatalogViewer } from "@/lib/catalog/entitlement.js";
import { crossEditionRejection } from "@/lib/rules/catalog-edition.js";
import { editionOf } from "@/lib/rules/edition.js";
import { classesOf, resolveSpellCatalogForEdition, SPELL_CLASS_MEMBERSHIP_SELECT } from "@/lib/spellcasting/spell-classes.js";
import { undefinedSpellEffectFields } from "@/lib/spellcasting/spell-effect-fields.js";
import { loadSubclassSpellListExpansionIds } from "@/lib/spellcasting/spell-list-expansion.js";
import { spellListsFor, type SubclassCasterRef } from "@/lib/srd/spellcasting-tables.js";

export const spellsRouter = Router();

// catalogOwnerUserId is resolveSpellCatalogForEdition's grouping input, never served on the wire. ownerId is the wire-safe field: null unless the row is the caller's own USER-scope entry, never a granted entry's actual owner.
type CatalogSpellRow = Spell & {
  classMemberships: { className: string }[];
  catalogOwnerUserId: string | null;
  ownerId: string | undefined;
  catalog: CatalogMeta;
};

// ownerId is present only on the caller's own homebrew; every other row's ownerId is undefined. The frontend derives provenance/fork UI from `catalog`, never `ownerId`.
function serializeCatalogSpellRow(row: CatalogSpellRow) {
  return {
    id: row.id,
    ownerId: row.ownerId,
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
    ...undefinedSpellEffectFields(row),
    catalog: row.catalog,
  };
}

/**
 * Resolves the CatalogViewer for `?characterId=`. Authorizes via
 * assertCharacterAccess. The viewer's `edition` is the character's own, via
 * `editionOf` — not the request's `?edition=`, which still gates the
 * fork-resolution/class-filter pipeline separately.
 */
async function resolveCharacterViewer(userId: string, characterId: string): Promise<CatalogViewer> {
  await assertCharacterAccess(prisma, userId, characterId, "view");
  const character = await prisma.character.findUniqueOrThrow({
    where: { id: characterId },
    select: { campaignId: true, rulesEdition: true },
  });
  return { userId, campaignId: character.campaignId, edition: editionOf(character) };
}

async function resolveViewer(
  userId: string,
  edition: RulesEdition,
  characterId: string | undefined,
): Promise<CatalogViewer> {
  if (characterId === undefined) return { userId, campaignId: null, edition };
  return resolveCharacterViewer(userId, characterId);
}

// The class-ownership check is load-bearing: without it, `?class=cleric&subclassId=<Eldritch Knight id>` would serve wizard spells to a cleric query. An id naming no row, the wrong edition's row, or a mismatched class all resolve to null, never a 400 — this is a read-only widening filter, not a mutation endpoint.
async function resolveSubclassCasterRef(
  subclassId: string | undefined,
  className: string,
  edition: RulesEdition,
): Promise<SubclassCasterRef | null> {
  if (!subclassId) return null;
  const row = await prisma.subclass.findUnique({
    where: { id: subclassId },
    select: { casterFraction: true, spellcastingAbility: true, edition: true, class: { select: { name: true } } },
  });
  if (!row || crossEditionRejection(row, "Subclass", edition)) return null;
  if (row.class.name.toLowerCase() !== className) return null;
  return { casterFraction: row.casterFraction, spellcastingAbility: row.spellcastingAbility };
}

async function loadResolvedSpells(
  viewer: CatalogViewer,
  edition: RulesEdition,
  maxLevel: number | undefined,
  className: string | undefined,
  subclassId: string | undefined,
): Promise<CatalogSpellRow[]> {
  const visibleEntries = await resolveVisibleEntries("SPELL", viewer);
  const dmCampaignIds = visibleEntries.some((e) => e.scope === "CAMPAIGN")
    ? await resolveDmCampaignIds(viewer.userId)
    : EMPTY_CAMPAIGN_ID_SET;
  const catalogByEntryId = new Map(
    visibleEntries.map((e) => [
      e.id,
      {
        catalogOwnerUserId: e.ownerUserId,
        ownerId: e.ownerUserId === viewer.userId ? e.ownerUserId : undefined,
        catalog: {
          entryId: e.id,
          scope: e.scope,
          isFork: e.forkedFromId !== null,
          forkedFromId: e.forkedFromId,
          editable: isCatalogEntryEditable(e, viewer.userId, dmCampaignIds),
        },
      },
    ]),
  );

  const rows = await prisma.spell.findMany({
    where: {
      catalogEntryId: { in: visibleEntries.map((e) => e.id) },
      ...(maxLevel === undefined ? {} : { level: { lte: maxLevel } }),
    },
    include: SPELL_CLASS_MEMBERSHIP_SELECT,
    orderBy: [{ level: "asc" }, { name: "asc" }],
  });
  const owned = rows.map((row) => {
    const meta = catalogByEntryId.get(row.catalogEntryId);
    // A miss here would mean the resolver and this route's own follow-up query disagree — never a legitimate runtime state.
    if (!meta) throw new Error(`Spell ${row.id} resolved to an untracked catalog entry ${row.catalogEntryId}`);
    return { ...row, catalogOwnerUserId: meta.catalogOwnerUserId, ownerId: meta.ownerId, catalog: meta.catalog };
  });
  const resolved = resolveSpellCatalogForEdition(owned, edition);
  if (!className) return resolved;

  const [expandedSpellIds, subclassCasterRef] = await Promise.all([
    loadSubclassSpellListExpansionIds(subclassId, edition).then((ids) => new Set(ids)),
    resolveSubclassCasterRef(subclassId, className, edition),
  ]);
  // Routed through spellListsFor, the same resolver the level-up gate uses (newSpellsStep/assertOnSpellList), so the two paths can't diverge. The hardcoded level 1 is below spellListsFor's only null-returning branch (Magical Secrets, level 10+), so `spells` is always a concrete list here.
  const spellLists = spellListsFor(className, 1, subclassCasterRef, edition).spells ?? [];
  return resolved.filter(
    (row) => classesOf(row).some((c) => spellLists.includes(c)) || expandedSpellIds.has(row.id),
  );
}

/**
 * GET /api/spells
 * Feeds the spellcasting section's "learn from catalog" picker. Ordered by level then name.
 *
 * `?edition=` required (400 if absent/unrecognized). `?class=` and `?maxLevel=` are optional
 * filters; `?class=` filters the RESOLVED row's own classesOf() list, never the raw SpellClass
 * join, since filtering before resolution can pick the wrong edition's row (#1715). `?subclassId=`
 * widens the pool via SubclassSpellListExpansion (never narrows) and applies the third-caster
 * redirect (Eldritch Knight/Arcane Trickster → the wizard list) through spellListsFor, the same
 * resolver the level-up gate uses. `?characterId=` scopes visibility to that character's campaign
 * via resolveCharacterViewer; its edition comes from the character, not `?edition=`.
 *
 * Resolution uses resolveSpellCatalogForEdition, not the withEditionOrShared +
 * resolveEditionCatalog pattern featsRouter/referenceRouter use — the spell catalog doesn't yet
 * have full 2014/2024 coverage, so that pattern would empty the picker for most 2014 casters.
 *
 * Visibility is resolveVisibleEntries("SPELL", viewer): every GLOBAL entry of the caller's
 * edition, the caller's own USER-scope entries, and — with `?characterId=` — entries
 * granted/shared into that character's campaign.
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
  const characterFilter = parseCharacterIdParam(req, res);
  if (!characterFilter.ok) return;

  const viewer = await resolveViewer(req.user!.id, edition, characterFilter.characterId);
  const spells = await loadResolvedSpells(
    viewer,
    edition,
    levelFilter.maxLevel,
    classFilter.className,
    subclassFilter.subclassId,
  );

  res.json(spells.map(serializeCatalogSpellRow));
});
