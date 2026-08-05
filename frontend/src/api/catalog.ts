import type { CatalogFeat, CatalogSpell, EditionsResponse, Item, ReferenceData } from "@/types/character";
import type { RulesEdition } from "@character-sheet/shared-types";
import { request } from "@/api/http";

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
