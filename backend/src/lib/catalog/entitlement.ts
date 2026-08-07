// Catalog entitlement resolver (#1797, epic #1795 2/6) — the single place
// visibility + fork-shadowing precedence is expressed for the CatalogEntry
// supertype (#1796). Generalizes the CAMPAIGN-Item shadow guard proven out at
// smaller scope by item-scope-shadowing.test.ts (#1645/#1646). No call site
// may re-implement this filtering or the precedence order (CLAUDE.md
// "level-gated state reconciles through one registry" sibling rule, applied
// here to catalog visibility instead of level gates).
import type { CatalogKind, CatalogMeta, RulesEdition } from "@character-sheet/shared-types";

import { Prisma, type Spell } from "@/generated/prisma/client.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";
import { prisma } from "@/lib/core/prisma.js";
import { editionOf } from "@/lib/rules/edition.js";

/** The identity a catalog visibility/shadowing query is resolved against. */
export type CatalogViewer = { userId: string; campaignId: string | null; edition: RulesEdition };

// Exported so a call site that needs the resolved WINNER rows themselves
// (not just ids) — e.g. GET /api/spells building its own ownerId/catalog
// wire fields — can consume resolveVisibleEntries' output directly instead
// of re-querying CatalogEntry for fields this resolver already fetched.
export type CandidateEntry = {
  id: string;
  scope: "GLOBAL" | "USER" | "CAMPAIGN";
  ownerUserId: string | null;
  ownerCampaignId: string | null;
  forkedFromId: string | null;
};

const CANDIDATE_SELECT = {
  id: true,
  scope: true,
  ownerUserId: true,
  ownerCampaignId: true,
  forkedFromId: true,
} satisfies Prisma.CatalogEntrySelect;

// Shared identity for the "no CAMPAIGN candidates, skip the query" fast path
// below and in spells.ts — a fresh `new Set()` per call would work identically
// but this reads as the deliberate constant it is.
export const EMPTY_CAMPAIGN_ID_SET: ReadonlySet<string> = new Set();

// Precedence within a fork lineage keys on the entry's ROLE for THIS viewer,
// not its abstract scope (#1797): the viewer's own USER fork outranks a
// CAMPAIGN fork in their campaign, which outranks the lineage origin —
// whether that origin is a shared USER row or a GLOBAL seed. Ranking on
// scope alone is wrong: a USER-scope origin (e.g. a player's homebrew
// granted into a campaign) would then outrank a DM's CAMPAIGN fork of it for
// every OTHER member, silently defeating the DM's override.
function precedenceRank(entry: CandidateEntry, viewer: CatalogViewer): number {
  if (entry.scope === "USER" && entry.ownerUserId === viewer.userId) return 3;
  if (entry.scope === "CAMPAIGN" && entry.ownerCampaignId === viewer.campaignId) return 2;
  return 1;
}

/**
 * Visible candidate set for one (kind, viewer): every GLOBAL row for the
 * viewer's edition, the viewer's own USER rows, any row granted into the
 * viewer's campaign, and the viewer's campaign's own CAMPAIGN rows — all
 * filtered to `viewer.edition` up front, never mixed across editions.
 */
async function fetchCandidates(kind: CatalogKind, viewer: CatalogViewer): Promise<CandidateEntry[]> {
  const scopeConditions: Prisma.CatalogEntryWhereInput[] = [
    { scope: "GLOBAL" },
    { scope: "USER", ownerUserId: viewer.userId },
  ];
  if (viewer.campaignId) {
    const campaignId = viewer.campaignId;
    scopeConditions.push({ scope: "CAMPAIGN", ownerCampaignId: campaignId });
    scopeConditions.push({ grants: { some: { campaignId } } });
  }
  return prisma.catalogEntry.findMany({
    where: { kind, edition: viewer.edition, OR: scopeConditions },
    select: CANDIDATE_SELECT,
  });
}

/**
 * Group an already-visible candidate set into fork lineages. Lineage is
 * found by walking each entry's `forkedFromId` chain to the highest ancestor
 * STILL PRESENT among the candidates — an ancestor outside the viewer's
 * scope (or nulled by the schema's `onDelete: SetNull` when the origin is
 * deleted) leaves nothing to group with, so the entry resolves on its own
 * rather than crashing or silently dropping. A `seen` guard makes a
 * pathological cyclic chain resolve (not hang) rather than assuming the data
 * can't do that.
 */
function groupLineages(candidates: CandidateEntry[]): CandidateEntry[][] {
  const byId = new Map(candidates.map((entry) => [entry.id, entry]));

  function lineageRoot(entry: CandidateEntry): string {
    const seen = new Set<string>([entry.id]);
    let current = entry;
    while (current.forkedFromId) {
      const parent = byId.get(current.forkedFromId);
      if (!parent || seen.has(parent.id)) return current.forkedFromId;
      seen.add(parent.id);
      current = parent;
    }
    return current.id;
  }

  const lineages = new Map<string, CandidateEntry[]>();
  for (const entry of candidates) {
    const root = lineageRoot(entry);
    const lineage = lineages.get(root);
    if (lineage) lineage.push(entry);
    else lineages.set(root, [entry]);
  }
  return [...lineages.values()];
}

/**
 * The highest-precedence entry within one fork lineage. Within a tied
 * `precedenceRank` — only possible when the viewer owns more than one entry
 * in the same lineage (their own origin AND their own fork of it) — the fork
 * wins over the root: forking is the deliberate override, so a self-fork
 * must still shadow its own origin.
 */
function pickLineageWinner(lineage: CandidateEntry[], viewer: CatalogViewer): CandidateEntry {
  let winner = lineage[0];
  for (const candidate of lineage.slice(1)) {
    const rankDelta = precedenceRank(candidate, viewer) - precedenceRank(winner, viewer);
    const outranks =
      rankDelta !== 0 ? rankDelta > 0 : candidate.forkedFromId !== null && winner.forkedFromId === null;
    if (outranks) winner = candidate;
  }
  return winner;
}

/**
 * Resolve the visible, shadow-resolved CatalogEntry ROWS for one
 * (kind, viewer) — one winner per fork lineage. The row shape a call site
 * needing more than the id (e.g. GET /api/spells' own scope/ownerUserId/
 * forkedFromId wire fields) can consume directly, rather than re-querying
 * CatalogEntry for fields this resolver's own fetchCandidates already
 * fetched (CLAUDE.md "one shared function" — no second query re-deriving
 * what this one already resolved).
 */
export async function resolveVisibleEntries(kind: CatalogKind, viewer: CatalogViewer): Promise<CandidateEntry[]> {
  const candidates = await fetchCandidates(kind, viewer);
  return groupLineages(candidates).map((lineage) => pickLineageWinner(lineage, viewer));
}

/** Resolve the visible, shadow-resolved CatalogEntry ids for one (kind, viewer). */
export async function resolveVisibleEntryIds(kind: CatalogKind, viewer: CatalogViewer): Promise<string[]> {
  return (await resolveVisibleEntries(kind, viewer)).map((entry) => entry.id);
}

/**
 * Every campaign id `userId` DMs (role OWNER), one batched query — the
 * building block for `CatalogMeta.editable` (#1808 leak-fix, epic #1795 8/9
 * combined-state review). A caller with N CAMPAIGN-scope rows in one response
 * calls this ONCE and checks the returned Set per row, rather than a
 * per-row `assertCampaignOwner`-shaped query (CLAUDE.md "avoid per-row
 * queries", and the literal ask that closed out #1808's review).
 */
export async function resolveDmCampaignIds(userId: string): Promise<Set<string>> {
  const memberships = await prisma.campaignMembership.findMany({
    where: { userId, role: "OWNER" },
    select: { campaignId: true },
  });
  return new Set(memberships.map((m) => m.campaignId));
}

/**
 * Pure predicate mirroring assertSpellOwnership's own rule
 * (lib/auth/access.ts): true iff `viewerUserId` could edit/delete this entry
 * through PATCH/DELETE /api/spells/custom/:id. A USER-scope entry is
 * editable only by its owner; a CAMPAIGN-scope entry only by that campaign's
 * DM (`dmCampaignIds`, resolveDmCampaignIds above); GLOBAL is never
 * editable. Kept as ONE function so a rule change to either side (this
 * predicate or assertSpellOwnership) is a visible two-call-site diff, not a
 * silent drift between "what the wire says is editable" and "what the write
 * path actually allows."
 */
export function isCatalogEntryEditable(
  entry: { scope: CandidateEntry["scope"]; ownerUserId: string | null; ownerCampaignId: string | null },
  viewerUserId: string,
  dmCampaignIds: ReadonlySet<string>,
): boolean {
  if (entry.scope === "USER") return entry.ownerUserId === viewerUserId;
  if (entry.scope === "CAMPAIGN") return entry.ownerCampaignId !== null && dmCampaignIds.has(entry.ownerCampaignId);
  return false;
}

function toCatalogMeta(entry: CandidateEntry, viewerUserId: string, dmCampaignIds: ReadonlySet<string>): CatalogMeta {
  return {
    entryId: entry.id,
    scope: entry.scope,
    isFork: entry.forkedFromId !== null,
    forkedFromId: entry.forkedFromId,
    editable: isCatalogEntryEditable(entry, viewerUserId, dmCampaignIds),
  };
}

/**
 * Resolve, for EVERY visible candidate entry id (winners and shadowed
 * lineage members alike), the `CatalogMeta` of its lineage's WINNER — the
 * one place a call site can map "an entry id I already hold a reference to"
 * onto "what's actually entitled to be shown for it today" without
 * re-walking `forkedFromId` chains or re-deriving precedence itself (CLAUDE.md
 * "one shared function"). This is what lets a call site holding a stale
 * pre-shadow entry id (e.g. a character's learned-spell snapshot, taken
 * before a DM later forked the origin) resolve straight to the shadowing
 * fork's metadata by id, with no name-based fallback and no risk of a
 * same-named-but-unrelated lineage colliding with it.
 *
 * Not exported: SPELL is the only kind today, so
 * resolveSpellEntitlementMetaForCharacter (below) is the only caller —
 * exported once a second kind needs its own viewer-typed wrapper.
 */
async function resolveEntitlementMeta(
  kind: CatalogKind,
  viewer: CatalogViewer,
): Promise<Map<string, CatalogMeta>> {
  const candidates = await fetchCandidates(kind, viewer);
  // Skip the query entirely when there's nothing CAMPAIGN-scope to resolve
  // (the common case: no character in play, or one outside any campaign) —
  // resolveDmCampaignIds is only ever consulted for a CAMPAIGN-scope
  // candidate, never a per-row cost.
  const dmCampaignIds = candidates.some((entry) => entry.scope === "CAMPAIGN")
    ? await resolveDmCampaignIds(viewer.userId)
    : EMPTY_CAMPAIGN_ID_SET;
  const meta = new Map<string, CatalogMeta>();
  for (const lineage of groupLineages(candidates)) {
    const winnerMeta = toCatalogMeta(pickLineageWinner(lineage, viewer), viewer.userId, dmCampaignIds);
    for (const entry of lineage) meta.set(entry.id, winnerMeta);
  }
  return meta;
}

/**
 * Resolve, for every visible candidate SPELL entry id, the winning lineage's
 * `Spell` MECHANICS row (#1806, epic #1795 7/7) — a read-time-only sibling of
 * resolveEntitlementMeta above, keyed the SAME way (every lineage member's id
 * maps to its lineage's winner, not just the winner's own id), reusing the
 * SAME fetchCandidates/groupLineages/pickLineageWinner computation rather
 * than a second precedence path. What lets serialize's spell-catalog overlay
 * (character/serialize/spell-catalog.ts) look up "the mechanics a stale
 * pre-shadow spellId's own entry id resolves to today" by one hop, exactly
 * like resolveEntitlementMeta's metaByEntryId map does for CatalogMeta.
 *
 * Not generalized across CatalogKind (unlike resolveEntitlementMeta): `Spell`
 * is a kind-specific mechanics table with no generic analog yet — SPELL is
 * the only kind, so this stays a direct, un-dispatched query rather than
 * forkContent's kind-switch shape.
 */
async function resolveSpellMechanicsWinners(viewer: CatalogViewer): Promise<Map<string, Spell>> {
  const candidates = await fetchCandidates("SPELL", viewer);
  const lineageWinners = groupLineages(candidates).map((lineage) => ({
    lineage,
    winner: pickLineageWinner(lineage, viewer),
  }));
  const winnerSpells = await prisma.spell.findMany({
    where: { catalogEntryId: { in: lineageWinners.map(({ winner }) => winner.id) } },
  });
  const spellByEntryId = new Map(winnerSpells.map((spell) => [spell.catalogEntryId, spell]));

  const mechanicsByEntryId = new Map<string, Spell>();
  for (const { lineage, winner } of lineageWinners) {
    const winnerSpell = spellByEntryId.get(winner.id);
    // Spell.catalogEntryId is required+unique (#1796) — a winner CatalogEntry
    // with no Spell row would be the same data-integrity violation
    // forkContent's own comment calls out, never a state a real lineage can
    // reach; skip defensively rather than throw mid-serialize.
    if (!winnerSpell) continue;
    for (const entry of lineage) mechanicsByEntryId.set(entry.id, winnerSpell);
  }
  return mechanicsByEntryId;
}

function viewerForCharacter(character: CharacterWithRelations): CatalogViewer {
  return {
    userId: character.ownerId,
    campaignId: character.campaignId,
    edition: editionOf(character),
  };
}

/**
 * Convenience wrapper deriving the viewer from a character row rather than
 * making every call site re-derive it. Edition comes from `editionOf`, never
 * hand-rolled off `rulesEdition` directly (CLAUDE.md).
 */
export async function resolveSpellEntryIdsForCharacter(character: CharacterWithRelations): Promise<string[]> {
  return resolveVisibleEntryIds("SPELL", viewerForCharacter(character));
}

/** Same convenience wrapper as resolveSpellEntryIdsForCharacter, for resolveEntitlementMeta. */
export async function resolveSpellEntitlementMetaForCharacter(
  character: CharacterWithRelations,
): Promise<Map<string, CatalogMeta>> {
  return resolveEntitlementMeta("SPELL", viewerForCharacter(character));
}

/** Same convenience wrapper as resolveSpellEntryIdsForCharacter, for resolveSpellMechanicsWinners. */
export async function resolveSpellMechanicsOverridesForCharacter(
  character: CharacterWithRelations,
): Promise<Map<string, Spell>> {
  return resolveSpellMechanicsWinners(viewerForCharacter(character));
}
