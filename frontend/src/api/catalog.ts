import type { CatalogFeat, CatalogSpell, EditionsResponse, Item, ReferenceData } from "@/types/character";
import type { GrantWire, RulesEdition } from "@character-sheet/shared-types";
import { jsonBody, request, send } from "@/api/http";

// A query param (not a header, #1325): there is no Cache-Control anywhere in
// backend/src and Express's default weak ETag is on, so a header could let
// HTTP hand a 2014 payload to a 2024 request underneath a correct TanStack
// queryKey. A query param makes that structurally impossible.
export async function fetchReference(edition: RulesEdition): Promise<ReferenceData> {
  return request<ReferenceData>(`/reference?edition=${edition}`, undefined, "Failed to fetch reference data");
}

// Feeds the inventory editor's "add from catalog" picker (Phase B).
export async function fetchItems(): Promise<Item[]> {
  return request<Item[]>("/items", undefined, "Failed to fetch items");
}

/** Server-applied spell-catalog narrowing (#1377); omit a field to leave it unfiltered. */
export interface SpellCatalogFilter {
  className?: string;
  maxLevel?: number;
  // #1631: a chosen subclass's list-expansion (e.g. The Fiend's Expanded
  // Spell List) widens `className`'s own membership filter with spells NOT
  // on the class's own list. Ignored server-side when className is absent —
  // see GET /api/spells's own comment.
  subclassId?: string;
}

// Feeds the spellcasting section's "learn from catalog" picker.
// Ordered by level then name server-side; no client-side re-sort needed.
//
// `edition` is required and the route 400s without it (#1712, same shape as
// fetchFeats/fetchReference) — every caller passes the VIEWING character's
// edition (or the creation draft's chosen edition, before a character exists)
// so a 2014 request never sees a 2024-only row. `class`/`maxLevel` stay
// optional, following fetchFeats' asiLevel pattern: the creation ceremony
// asks for one class's legal band and the server applies the eligibility
// rule (#1377), while the sheet's picker wants the whole (one-edition) catalog.
export async function fetchSpells(edition: RulesEdition, filter: SpellCatalogFilter = {}): Promise<CatalogSpell[]> {
  const params = new URLSearchParams({ edition });
  if (filter.className !== undefined) params.set("class", filter.className);
  if (filter.maxLevel !== undefined) params.set("maxLevel", String(filter.maxLevel));
  if (filter.subclassId !== undefined) params.set("subclassId", filter.subclassId);
  return request<CatalogSpell[]>(`/spells?${params.toString()}`, undefined, "Failed to fetch spell catalog");
}

// Feeds the advancement section's feat picker — same role as fetchManeuvers.
// Ordered alphabetically server-side. `edition` is required and the route 400s
// without it (#1411), for the same reason fetchReference above carries it as a
// query param rather than a header.
//
// `asiLevel` asks the server to apply the PHB'24 ASI-slot eligibility rule
// (#1438) — omit it and the whole edition catalog comes back, which is what the
// Fighting Style picker and the level-up review step need, since both read rows
// that rule rejects by design.
export async function fetchFeats(edition: RulesEdition, asiLevel?: number): Promise<CatalogFeat[]> {
  const asiParam = asiLevel === undefined ? "" : `&asiLevel=${asiLevel}`;
  return request<CatalogFeat[]>(`/feats?edition=${edition}${asiParam}`, undefined, "Failed to fetch feat catalog");
}

// The only catalog call in this module that takes NO edition, and deliberately
// so (#1436): it is what the client reads in order to CHOOSE one, so it must be
// answerable before any edition is settled. Adding a param here "for symmetry"
// would make the edition picker depend on the answer it exists to produce.
export async function fetchEditions(): Promise<EditionsResponse> {
  return request<EditionsResponse>("/editions", undefined, "Failed to fetch rules editions");
}

// Grant CRUD (#1799, epic #1795 4/6): the owner of a USER-scope catalog entry
// (a homebrew spell) shares/unshares it into a campaign they belong to.
// Ownership-scoped plain REST against grants.ts, same idempotent-POST /
// deleteMany-DELETE shape that route documents — a second identical POST is
// a 200, not a 409/500, and DELETE 204s even if the grant is already gone, so
// neither call site here needs to know the entry's CURRENT grant state up
// front (there is no GET …/grants list endpoint — see ShareSpellSheet's own
// comment for how the UI copes with that).
export async function shareCatalogEntry(entryId: string, campaignId: string): Promise<GrantWire> {
  return request<GrantWire>(
    `/catalog/entries/${entryId}/grants`,
    jsonBody({ campaignId }),
    "Failed to share spell into campaign",
  );
}

export async function unshareCatalogEntry(entryId: string, campaignId: string): Promise<void> {
  await send(
    `/catalog/entries/${entryId}/grants/${campaignId}`,
    { method: "DELETE" },
    "Failed to unshare spell from campaign",
  );
}

/** POST …/fork request body (#1800, epic #1795 5/6) — mirrors catalogForkSchema's own shape. */
export type CatalogForkTarget = { scope: "USER" } | { scope: "CAMPAIGN"; campaignId: string };

// Fork (#1800, epic #1795 5/6): a self-contained deep copy of a visible
// catalog entry into the caller's own USER stash ("make my version"), or —
// for a campaign's DM only — into that campaign's CAMPAIGN scope ("override
// for campaign"). The response's `spell` is the SAME served shape GET
// /api/spells rows carry (CatalogSpell), so the caller can add it straight to
// a locally-held catalog list without a refetch.
export async function forkCatalogEntry(entryId: string, target: CatalogForkTarget): Promise<{ entryId: string; spell: CatalogSpell }> {
  return request<{ entryId: string; spell: CatalogSpell }>(
    `/catalog/entries/${entryId}/fork`,
    jsonBody(target),
    "Failed to fork spell",
  );
}
