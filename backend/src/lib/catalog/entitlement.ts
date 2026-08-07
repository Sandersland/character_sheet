// Catalog entitlement resolver (#1797, epic #1795 2/6) — the single place
// visibility + fork-shadowing precedence is expressed for the CatalogEntry
// supertype (#1796). Generalizes the CAMPAIGN-Item shadow guard proven out at
// smaller scope by item-scope-shadowing.test.ts (#1645/#1646). No call site
// may re-implement this filtering or the precedence order (CLAUDE.md
// "level-gated state reconciles through one registry" sibling rule, applied
// here to catalog visibility instead of level gates).
import type { CatalogKind, CatalogMeta, RulesEdition } from "@character-sheet/shared-types";

import { Prisma } from "@/generated/prisma/client.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";
import { prisma } from "@/lib/core/prisma.js";
import { editionOf } from "@/lib/rules/edition.js";

/** The identity a catalog visibility/shadowing query is resolved against. */
export type CatalogViewer = { userId: string; campaignId: string | null; edition: RulesEdition };

type CandidateEntry = {
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

/** Resolve the visible, shadow-resolved CatalogEntry ids for one (kind, viewer). */
export async function resolveVisibleEntryIds(kind: CatalogKind, viewer: CatalogViewer): Promise<string[]> {
  const candidates = await fetchCandidates(kind, viewer);
  return groupLineages(candidates).map((lineage) => pickLineageWinner(lineage, viewer).id);
}

function toCatalogMeta(entry: CandidateEntry): CatalogMeta {
  return { entryId: entry.id, scope: entry.scope, isFork: entry.forkedFromId !== null, forkedFromId: entry.forkedFromId };
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
  const meta = new Map<string, CatalogMeta>();
  for (const lineage of groupLineages(candidates)) {
    const winnerMeta = toCatalogMeta(pickLineageWinner(lineage, viewer));
    for (const entry of lineage) meta.set(entry.id, winnerMeta);
  }
  return meta;
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
