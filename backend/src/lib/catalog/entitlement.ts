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
    const path: CandidateEntry[] = [entry];
    let current = entry;
    while (current.forkedFromId) {
      const parent = byId.get(current.forkedFromId);
      if (!parent) return current.forkedFromId;
      const cycleStart = path.findIndex((node) => node.id === parent.id);
      if (cycleStart !== -1) {
        // A cyclic forkedFromId chain (data integrity violation — forks form
        // a DAG by construction, forkContent only ever points a NEW entry at
        // an EXISTING one) must still resolve to a STABLE root regardless of
        // which cycle member lineageRoot started from, or every member
        // becomes its own one-entry "lineage" and wins independently (#1815
        // review finding 4: a 2-node cycle A<->B used to return root(A)=B.id
        // and root(B)=A.id — two different lineages, two winners, both
        // served). The lexicographically smallest id among the cycle's own
        // members (the slice of this walk from the repeat back to its first
        // occurrence, not the whole path — an acyclic tail leading into the
        // cycle must still resolve to the SAME root the cycle itself does)
        // is that stable choice: every member's own walk detects the same
        // cycle membership and picks the same minimum, however it entered.
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
 * Visibility check for ONE already-known CatalogEntry (#1815 review finding
 * 1) — restates fetchCandidates' own GLOBAL/USER/CAMPAIGN/grant admission
 * rule for a caller (the fork route) that already holds one entry rather
 * than resolving a whole visible set. The grant arm checks ANY campaign the
 * viewer belongs to, not one `viewer.campaignId` — a fork request carries no
 * single campaign context (a USER-scope fork target has none at all), unlike
 * resolveVisibleEntries' viewer-scoped resolution — so this widens
 * fetchCandidates' `grants: { some: { campaignId } }` arm across every
 * membership instead of one. Previously the fork route hand-rolled a copy of
 * this check with NO grants arm at all: a member could see a spell shared
 * into their campaign (this same resolver, slice 2) but got 403 forking it —
 * the confirmed bug this function closes by giving fork.ts the resolver's
 * own visibility notion instead of a second, incomplete one.
 */
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
 * Resolve BOTH the entitlement META and MECHANICS winners for one (kind,
 * viewer) from a SINGLE fetchCandidates snapshot (#1815 review finding 3).
 * Previously the character-serialize spell-catalog overlay ran the META and
 * MECHANICS resolutions as two independent `fetchCandidates`-backed calls
 * inside one `Promise.all` — each its own CatalogEntry read, so a fork
 * committing between them could produce a response with fork METADATA from
 * the post-fork snapshot but MECHANICS from the pre-fork one (or vice
 * versa): a split-brain response. Fetching candidates once and deriving both
 * maps from the SAME lineage groupings makes that impossible — the two maps
 * always agree on which lineage member won, because they're the same
 * computation read twice, not two computations that can independently race.
 * `CatalogMeta` maps every visible id (winners and shadowed lineage members
 * alike) to its lineage's winner's meta; MECHANICS maps the same ids to the
 * winner's `Spell` row, present only when the kind is SPELL and the winner
 * has one (a winner CatalogEntry with no Spell row is the same data-
 * integrity violation forkContent's own comment calls out — skipped
 * defensively rather than thrown mid-serialize).
 *
 * Not exported: SPELL is the only kind today, so
 * resolveSpellEntitlementForCharacter (below) is the only caller — exported
 * once a second kind needs its own viewer-typed wrapper (same rule this
 * function's own predecessor, resolveEntitlementMeta, followed).
 */
async function resolveEntitlementForViewer(
  kind: CatalogKind,
  viewer: CatalogViewer,
): Promise<{ metaByEntryId: Map<string, CatalogMeta>; mechanicsByEntryId: Map<string, Spell> }> {
  const candidates = await fetchCandidates(kind, viewer);
  // Skip the query entirely when there's nothing CAMPAIGN-scope to resolve
  // (the common case: no character in play, or one outside any campaign) —
  // resolveDmCampaignIds is only ever consulted for a CAMPAIGN-scope
  // candidate, never a per-row cost.
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

/**
 * Convenience wrapper deriving the viewer from a character row rather than
 * making every call site re-derive it. Edition comes from `editionOf`, never
 * hand-rolled off `rulesEdition` directly (CLAUDE.md).
 */
export async function resolveSpellEntryIdsForCharacter(character: CharacterWithRelations): Promise<string[]> {
  return resolveVisibleEntryIds("SPELL", viewerForCharacter(character));
}

/**
 * Same convenience wrapper as resolveSpellEntryIdsForCharacter, for
 * resolveEntitlementForViewer — the single-snapshot META+MECHANICS pair
 * spell-catalog.ts's attachSpellCatalogMeta consumes together (#1815 review
 * finding 3: this is what replaced its old two-independent-calls shape).
 */
export async function resolveSpellEntitlementForCharacter(
  character: CharacterWithRelations,
): Promise<{ metaByEntryId: Map<string, CatalogMeta>; mechanicsByEntryId: Map<string, Spell> }> {
  return resolveEntitlementForViewer("SPELL", viewerForCharacter(character));
}
