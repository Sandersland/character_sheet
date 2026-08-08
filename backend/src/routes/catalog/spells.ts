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
import { spellListsFor } from "@/lib/srd/spellcasting-tables.js";

export const spellsRouter = Router();

// `ownerId`/`catalogOwnerUserId`/`catalog` are derived off the CatalogEntry a
// row's `catalogEntryId` resolves to (#1796 dropped the Spell column
// `ownerId` used to read from), attached by the route handler below BEFORE
// resolution/serialization. Two DIFFERENT owner-shaped fields, deliberately
// (#1815 review finding 2): `catalogOwnerUserId` is the entry's RAW
// `ownerUserId` — resolveSpellCatalogForEdition's own grouping input (see
// that function's comment), never served on the wire. `ownerId` is the
// WIRE-SAFE field serializeCatalogSpellRow below actually serves — null
// unless the row is the CALLER's own USER-scope entry. Collapsing these into
// one field was the bug: GET /api/spells used to serve `e.ownerUserId`
// unconditionally, which for a granted (not owned) entry is the GRANTER's
// id, not the caller's — leaking another user's id and breaking every
// ownerId-driven UI signal for a granted row (fork button hidden, wrong
// scope badge). catalogProvenance.ts/homebrewSpell.ts (frontend) no longer
// read `ownerId` for any of that (they read `catalog.editable`/`catalog.scope`
// instead, per CLAUDE.md "frontend never originates a rule") — this fixes
// the value too, as defense in depth, restoring the invariant this file's
// own comment on `ownerId` below promises.
type CatalogSpellRow = Spell & {
  classMemberships: { className: string }[];
  catalogOwnerUserId: string | null;
  ownerId: string | undefined;
  catalog: CatalogMeta;
};

// `ownerId` is present only on the caller's own homebrew (#1788) — every
// other row's ownerId is `undefined` (seeded/GLOBAL, another user's granted/
// shared homebrew, or a DM's CAMPAIGN fork) by the time loadResolvedSpells
// attaches it below, so this is the client's only signal for "mine, offer
// edit/delete" vs. not — it never leaks another user's id (#1815 review
// finding 2 restores this promise; see CatalogSpellRow's own comment for the
// bug it used to have). `catalog` (#1798, epic #1795 3/6 — additive over the
// pre-#1796 response, see SpellWire's own comment in shared-types/src/
// catalog.ts) is the entitlement metadata every catalog-content row now
// carries, and is what the frontend actually derives provenance/fork UI
// from (never `ownerId` — CLAUDE.md "frontend never originates a rule").
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
 * Resolve the CatalogViewer for `?characterId=` (#1811, epic #1795 9/9).
 * Ownership gates through `assertCharacterAccess` — the one chokepoint every
 * character-scoped route authorizes through (lib/auth/access.ts) — so a
 * characterId naming someone else's character 404s/403s exactly like every
 * other character-scoped read, never a picker-specific auth path. The
 * viewer's `edition` is the CHARACTER's own, via `editionOf` (CLAUDE.md:
 * never hand-roll off `rulesEdition` directly) — NOT the request's
 * `?edition=` value, which continues to gate the fork-resolution/class-filter
 * pipeline below unchanged; visibility itself must key off the real
 * character, not whatever edition the request happens to also carry.
 */
async function resolveCharacterViewer(userId: string, characterId: string): Promise<CatalogViewer> {
  await assertCharacterAccess(prisma, userId, characterId, "view");
  const character = await prisma.character.findUniqueOrThrow({
    where: { id: characterId },
    select: { campaignId: true, rulesEdition: true },
  });
  return { userId, campaignId: character.campaignId, edition: editionOf(character) };
}

// Dispatches on `?characterId=`'s presence — pulled out of the route handler
// (alongside resolveCharacterViewer/loadResolvedSpells below) purely to keep
// the handler itself at a low enough cyclomatic/CRAP score for the fallow
// pre-commit gate (CLAUDE.md's cyclo 16 / CRAP 25 ceiling); no behavior
// lives here beyond the branch itself.
async function resolveViewer(
  userId: string,
  edition: RulesEdition,
  characterId: string | undefined,
): Promise<CatalogViewer> {
  if (characterId === undefined) return { userId, campaignId: null, edition };
  return resolveCharacterViewer(userId, characterId);
}

// Resolves `?subclassId=` to the catalog Subclass row's own NAME (#1825) — the
// key spellListsFor's third-caster redirect checks (THIRD_CASTER_SUBCLASSES,
// spellcasting-tables.ts), same free-text-name key that module's every other
// third-caster check already uses. An id naming no row, or the WRONG
// edition's row (crossEditionRejection, #1345 catalog-id-edition-guard), or
// absent altogether all resolve to null — same "no widening" posture
// parseSubclassIdParam's own doc comment takes for an unrecognized/absent id.
// Never a 400 here: this is a read-only widening filter, not a mutation
// endpoint, so a wrong-edition id is inert rather than rejected.
async function resolveSubclassName(subclassId: string | undefined, edition: RulesEdition): Promise<string | null> {
  if (!subclassId) return null;
  const row = await prisma.subclass.findUnique({ where: { id: subclassId }, select: { name: true, edition: true } });
  if (!row || crossEditionRejection(row, "Subclass", edition)) return null;
  return row.name;
}

/**
 * The visible-entries → Spell rows → edition/class resolution pipeline,
 * pulled out of the route handler for the same CRAP-ceiling reason
 * resolveViewer above documents. Takes the already-parsed filters so it
 * carries no query-parsing of its own; returns the fully resolved row set the
 * handler serializes.
 */
async function loadResolvedSpells(
  viewer: CatalogViewer,
  edition: RulesEdition,
  maxLevel: number | undefined,
  className: string | undefined,
  subclassId: string | undefined,
): Promise<CatalogSpellRow[]> {
  const visibleEntries = await resolveVisibleEntries("SPELL", viewer);
  // Batched once per response, not per row (#1808 leak-fix review) — and
  // skipped entirely when nothing CAMPAIGN-scope is even in play, same fast
  // path resolveEntitlementForViewer's own comment documents.
  const dmCampaignIds = visibleEntries.some((e) => e.scope === "CAMPAIGN")
    ? await resolveDmCampaignIds(viewer.userId)
    : EMPTY_CAMPAIGN_ID_SET;
  const catalogByEntryId = new Map(
    visibleEntries.map((e) => [
      e.id,
      {
        // Raw grouping input for resolveSpellCatalogForEdition below — NEVER
        // served on the wire (see CatalogSpellRow's own comment).
        catalogOwnerUserId: e.ownerUserId,
        // Wire-safe: only the caller's own USER-scope row carries an id; a
        // granted/shared entry's actual owner (e.ownerUserId) is someone
        // else's id and must never reach the response (#1815 review finding 2).
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
    // Every row's catalogEntryId came from the `visibleEntryIds` filter above,
    // so a miss here would mean the resolver and this route's own follow-up
    // query disagree — never a legitimate runtime state.
    if (!meta) throw new Error(`Spell ${row.id} resolved to an untracked catalog entry ${row.catalogEntryId}`);
    return { ...row, catalogOwnerUserId: meta.catalogOwnerUserId, ownerId: meta.ownerId, catalog: meta.catalog };
  });
  const resolved = resolveSpellCatalogForEdition(owned, edition);
  if (!className) return resolved;

  const [expandedSpellIds, subclassName] = await Promise.all([
    loadSubclassSpellListExpansionIds(subclassId, edition).then((ids) => new Set(ids)),
    resolveSubclassName(subclassId, edition),
  ]);
  // #1825: routed through the SAME resolver the level-up gate uses, so a
  // third-caster subclass's `?class=fighter&subclassId=<EK id>` picker widens
  // to the wizard list instead of matching nothing — the divergence this
  // route used to have from newSpellsStep/assertOnSpellList. No per-class
  // character level reaches this route (unlike the level-up gate, which
  // always has the advancing class's real level), so Magical Secrets'
  // level-10 gate is passed a level below its own threshold here — the
  // pre-existing "this route doesn't widen for Magical Secrets" behavior,
  // left unchanged; only the level-INDEPENDENT third-caster redirect is
  // newly applied. That level-1 call is also below the only null-returning
  // branch (Magical Secrets, level 10+ — see spellListsFor), so `spells` is
  // always a concrete list here and no unrestricted-null case can arise. The
  // `?subclassId=` list-EXPANSION union (Warlock patrons) stays additive on
  // top, unchanged.
  const spellLists = spellListsFor(className, 1, subclassName, edition).spells ?? [];
  return resolved.filter(
    (row) => classesOf(row).some((c) => spellLists.includes(c)) || expandedSpellIds.has(row.id),
  );
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
 * first and filtering the RESOLVED row's own classesOf() list against
 * `spellListsFor`'s (spellcasting-tables.ts) served `spells` list — rather
 * than a bare `.includes(className)` — keeps the class check scoped to the
 * edition actually being served AND routes `?subclassId=`'s third-caster
 * redirect (#1825: Eldritch Knight/Arcane Trickster → the wizard list, off
 * the resolved subclass row's own name) through the SAME resolver the
 * level-up gate uses (newSpellsStep/assertOnSpellList), so the two paths
 * cannot diverge on which list a class+subclass resolves to. The served JSON
 * still flattens back to `classes: string[]` via classesOf, so
 * frontend/src/lib/newSpells.ts and spellList.ts consume the response
 * unchanged.
 *
 * `?subclassId=` (#1631) is also a THIRD optional filter, applied alongside
 * `?class=`: a chosen subclass's SubclassSpellListExpansion widens the pool
 * with spells NOT on the class's own list (PHB'14 Warlock patrons — "Add
 * fiend spells to your warlock list"). Only ever WIDENS, never narrows —
 * absent or a subclass with no expansion rows is a no-op, matching
 * `?class=`'s own "no match still 200s with an empty/unwidened list" posture.
 * Ignored when `?class=` is absent (the unfiltered catalog already contains
 * everything a widening could add). Kept additive on top of the
 * `spellListsFor`-driven filter above, never replacing it.
 *
 * The visibility filter (#1786, epic #1782 3/5; re-sourced off CatalogEntry
 * by #1796, epic #1795 1/6; wired to the resolver by #1798, epic #1795 3/6 —
 * REPLACES the interim two-query owner filter this route carried until now)
 * is `resolveVisibleEntries("SPELL", viewer)` (lib/catalog/entitlement.ts):
 * every GLOBAL entry of the caller's edition, the caller's own USER-scope
 * entries, and — for a fork lineage — only the highest-precedence entry
 * (never re-implemented here, see that module's own comment). With no
 * `?characterId=` this route has no campaign context (no character in play,
 * just an authenticated caller), so `viewer.campaignId` is null — same
 * behavior as before #1811. With `?characterId=` (#1811, epic #1795 9/9,
 * `resolveCharacterViewer` above), `viewer.campaignId` is that character's
 * own `campaignId`, so a CAMPAIGN-scope entry or a USER entry granted into
 * the character's campaign reaches the picker too — the same visibility a
 * fellow campaign member's granted/shared spell already gets in
 * serializeCharacter (#1798's other read path), now also in the "learn a new
 * spell" picker, not just on an already-known spell's re-resolved mechanics.
 * The resolver's own rows (id/scope/
 * ownerUserId/forkedFromId) are consumed directly for `ownerId`/`catalog`
 * below — no second CatalogEntry query re-fetching fields it already has.
 * Spell.catalogEntryId carries no Prisma relation (the supertype stays
 * closed, see schema.prisma's own comment on that column), so the visible id
 * set is what's handed to a plain `catalogEntryId: { in: [...] }` filter.
 * Each row is then tagged with its wire-safe `ownerId` (undefined unless the
 * row is the CALLER's own USER-scope entry — #1815 review finding 2; see
 * CatalogSpellRow's own comment) AND its `catalog` metadata (SpellWire.catalog,
 * locked in slice 1) before flowing through the exact same resolution/class/
 * level pipeline as before (resolveSpellCatalogForEdition's grouping key
 * uses the SEPARATE raw `catalogOwnerUserId` field, never the wire-safe
 * `ownerId` — see that function's own comment for the same-name collision
 * case). `spellsRouter` is mounted `"authed"` in routes/manifest.ts, so
 * `req.user` is always populated here.
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
