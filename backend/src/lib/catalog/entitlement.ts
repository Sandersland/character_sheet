// Single source of truth for catalog visibility/shadowing precedence (#1795/#1797) — no call site may reimplement this filtering.
import type { CatalogKind, CatalogMeta, RulesEdition } from "@character-sheet/shared-types";

import { Prisma, type Spell } from "@/generated/prisma/client.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";
import { prisma } from "@/lib/core/prisma.js";
import { editionOf } from "@/lib/rules/edition.js";

export type CatalogViewer = { userId: string; campaignId: string | null; edition: RulesEdition };

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

export const EMPTY_CAMPAIGN_ID_SET: ReadonlySet<string> = new Set();

// Precedence keys on the entry's ROLE for this viewer, not raw scope (#1797) — ranking on scope alone would let a USER-scope origin outrank a DM's CAMPAIGN fork of it for every other member.
function precedenceRank(entry: CandidateEntry, viewer: CatalogViewer): number {
  if (entry.scope === "USER" && entry.ownerUserId === viewer.userId) return 3;
  if (entry.scope === "CAMPAIGN" && entry.ownerCampaignId === viewer.campaignId) return 2;
  return 1;
}

// Filtered to viewer.edition up front — candidates are never mixed across editions.
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

// An ancestor outside the candidate set (or nulled by onDelete: SetNull) leaves the entry to resolve on its own, never crash or drop.
function groupLineages(candidates: CandidateEntry[]): CandidateEntry[][] {
  const byId = new Map(candidates.map((entry) => [entry.id, entry]));

  function lineageRoot(entry: CandidateEntry): string {
    const path: CandidateEntry[] = [entry];
    let current = entry;
    while (current.forkedFromId) {
      const parent = byId.get(current.forkedFromId);
      if (!parent) return current.forkedFromId;
      const cycleStart = path.findIndex((node) => node.id === parent.id);
      if (cycleStart !== -1) {
        // Cycle root must be picked stably regardless of which member started the walk, or a 2-node cycle resolves to two different winners (#1815 finding 4).
        const cycle = path.slice(cycleStart);
        return cycle.reduce((min, node) => (node.id < min ? node.id : min), cycle[0].id);
      }
      path.push(parent);
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

// Tied precedence (viewer owns both the origin and their own fork of it) breaks toward the fork — a self-fork must still shadow its own origin.
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

export async function resolveVisibleEntries(kind: CatalogKind, viewer: CatalogViewer): Promise<CandidateEntry[]> {
  const candidates = await fetchCandidates(kind, viewer);
  return groupLineages(candidates).map((lineage) => pickLineageWinner(lineage, viewer));
}

export async function resolveVisibleEntryIds(kind: CatalogKind, viewer: CatalogViewer): Promise<string[]> {
  return (await resolveVisibleEntries(kind, viewer)).map((entry) => entry.id);
}

// Grant check spans every campaign the viewer belongs to — a fork request carries no single campaignId context, unlike fetchCandidates' viewer-scoped resolution.
export async function isCatalogEntryVisibleToUser(
  entry: Pick<CandidateEntry, "id" | "scope" | "ownerUserId" | "ownerCampaignId">,
  userId: string,
): Promise<boolean> {
  if (entry.scope === "GLOBAL") return true;
  if (entry.scope === "USER" && entry.ownerUserId === userId) return true;
  if (entry.scope === "CAMPAIGN" && entry.ownerCampaignId) {
    const membership = await prisma.campaignMembership.findUnique({
      where: { campaignId_userId: { campaignId: entry.ownerCampaignId, userId } },
      select: { userId: true },
    });
    if (membership) return true;
  }
  if (entry.scope === "USER") {
    const grant = await prisma.catalogGrant.findFirst({
      where: { catalogEntryId: entry.id, campaign: { members: { some: { userId } } } },
      select: { id: true },
    });
    if (grant) return true;
  }
  return false;
}

// Call once per response and check the returned Set per row — never a per-row query (#1808).
export async function resolveDmCampaignIds(userId: string): Promise<Set<string>> {
  const memberships = await prisma.campaignMembership.findMany({
    where: { userId, role: "OWNER" },
    select: { campaignId: true },
  });
  return new Set(memberships.map((m) => m.campaignId));
}

// Mirrors assertSpellOwnership's rule — keep both in sync so wire "editable" matches actual write permission.
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

// Single fetchCandidates snapshot backs both META and MECHANICS maps — two independent queries could split-brain across a concurrent fork (#1815 finding 3).
async function resolveEntitlementForViewer(
  kind: CatalogKind,
  viewer: CatalogViewer,
): Promise<{ metaByEntryId: Map<string, CatalogMeta>; mechanicsByEntryId: Map<string, Spell> }> {
  const candidates = await fetchCandidates(kind, viewer);
  const dmCampaignIds = candidates.some((entry) => entry.scope === "CAMPAIGN")
    ? await resolveDmCampaignIds(viewer.userId)
    : EMPTY_CAMPAIGN_ID_SET;

  const lineageWinners = groupLineages(candidates).map((lineage) => ({
    lineage,
    winner: pickLineageWinner(lineage, viewer),
  }));

  const metaByEntryId = new Map<string, CatalogMeta>();
  for (const { lineage, winner } of lineageWinners) {
    const winnerMeta = toCatalogMeta(winner, viewer.userId, dmCampaignIds);
    for (const entry of lineage) metaByEntryId.set(entry.id, winnerMeta);
  }

  const mechanicsByEntryId = new Map<string, Spell>();
  if (kind === "SPELL") {
    const winnerSpells = await prisma.spell.findMany({
      where: { catalogEntryId: { in: lineageWinners.map(({ winner }) => winner.id) } },
    });
    const spellByEntryId = new Map(winnerSpells.map((spell) => [spell.catalogEntryId, spell]));
    for (const { lineage, winner } of lineageWinners) {
      const winnerSpell = spellByEntryId.get(winner.id);
      if (!winnerSpell) continue;
      for (const entry of lineage) mechanicsByEntryId.set(entry.id, winnerSpell);
    }
  }

  return { metaByEntryId, mechanicsByEntryId };
}

function viewerForCharacter(character: CharacterWithRelations): CatalogViewer {
  return {
    userId: character.ownerId,
    campaignId: character.campaignId,
    edition: editionOf(character),
  };
}

// Edition always comes from editionOf, never hand-rolled off rulesEdition directly.
export async function resolveSpellEntryIdsForCharacter(character: CharacterWithRelations): Promise<string[]> {
  return resolveVisibleEntryIds("SPELL", viewerForCharacter(character));
}

export async function resolveSpellEntitlementForCharacter(
  character: CharacterWithRelations,
): Promise<{ metaByEntryId: Map<string, CatalogMeta>; mechanicsByEntryId: Map<string, Spell> }> {
  return resolveEntitlementForViewer("SPELL", viewerForCharacter(character));
}
