import type { CatalogFeat, CatalogSpell, EditionsResponse, Item, ReferenceData } from "@/types/character";
import type { GrantWire, RulesEdition } from "@character-sheet/shared-types";
import { jsonBody, request, send } from "@/api/http";

// A query param, not a header (#1325): there is no Cache-Control in
// backend/src and Express's default weak ETag is on, so a header could hand
// a 2014 payload to a 2024 request underneath a correct TanStack queryKey.
export async function fetchReference(edition: RulesEdition): Promise<ReferenceData> {
  return request<ReferenceData>(`/reference?edition=${edition}`, undefined, "Failed to fetch reference data");
}

export async function fetchItems(): Promise<Item[]> {
  return request<Item[]>("/items", undefined, "Failed to fetch items");
}

/** Server-applied spell-catalog narrowing (#1377); omit a field to leave it unfiltered. */
export interface SpellCatalogFilter {
  className?: string;
  maxLevel?: number;
  // A chosen subclass's list-expansion (e.g. The Fiend's Expanded Spell
  // List) widens `className`'s own filter with spells not on the class
  // list. Ignored server-side when className is absent.
  subclassId?: string;
  // The character the picker is learning for. Present, the server resolves
  // that character's own campaign's shared/granted spells and DM CAMPAIGN
  // overrides (spells.ts's resolveCharacterViewer). Absent, behavior is
  // unchanged (GLOBAL + the caller's own USER entries) — used by the
  // creation ceremony, which has no character yet.
  characterId?: string;
}

// Ordered by level then name server-side; no client-side re-sort needed.
// `edition` is required — the route 400s without it (#1712).
export async function fetchSpells(edition: RulesEdition, filter: SpellCatalogFilter = {}): Promise<CatalogSpell[]> {
  const params = new URLSearchParams({ edition });
  if (filter.className !== undefined) params.set("class", filter.className);
  if (filter.maxLevel !== undefined) params.set("maxLevel", String(filter.maxLevel));
  if (filter.subclassId !== undefined) params.set("subclassId", filter.subclassId);
  if (filter.characterId !== undefined) params.set("characterId", filter.characterId);
  return request<CatalogSpell[]>(`/spells?${params.toString()}`, undefined, "Failed to fetch spell catalog");
}

// Ordered alphabetically server-side. `edition` is required — the route
// 400s without it (#1411).
// `asiLevel` applies the PHB'24 ASI-slot eligibility rule (#1438); omit it
// for the unfiltered catalog.
// `classNames` applies the Fighting Style class gate (#1495) via
// fightingStyleFeatOfferedForClasses; omit (or pass []) for the unfiltered
// catalog.
export async function fetchFeats(
  edition: RulesEdition,
  asiLevel?: number,
  classNames?: string[],
): Promise<CatalogFeat[]> {
  const asiParam = asiLevel === undefined ? "" : `&asiLevel=${asiLevel}`;
  const classesParam =
    classNames && classNames.length > 0 ? `&classes=${encodeURIComponent(classNames.join(","))}` : "";
  return request<CatalogFeat[]>(
    `/feats?edition=${edition}${asiParam}${classesParam}`,
    undefined,
    "Failed to fetch feat catalog",
  );
}

// Deliberately takes no edition (#1436): this is what the client reads to
// CHOOSE one, so it must be answerable before any edition is settled.
export async function fetchEditions(): Promise<EditionsResponse> {
  return request<EditionsResponse>("/editions", undefined, "Failed to fetch rules editions");
}

// Idempotent: a duplicate POST is a 200 (not 409/500), and DELETE 204s even
// if the grant is already gone — so neither call site needs to know the
// entry's current grant state up front.
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

/** POST …/fork body — mirrors catalogForkSchema's shape. */
export type CatalogForkTarget = { scope: "USER" } | { scope: "CAMPAIGN"; campaignId: string };

// The response's `spell` is the same shape GET /api/spells rows carry
// (CatalogSpell), so the caller can add it straight to a locally-held
// catalog list without a refetch.
export async function forkCatalogEntry(entryId: string, target: CatalogForkTarget): Promise<{ entryId: string; spell: CatalogSpell }> {
  return request<{ entryId: string; spell: CatalogSpell }>(
    `/catalog/entries/${entryId}/fork`,
    jsonBody(target),
    "Failed to fork spell",
  );
}
