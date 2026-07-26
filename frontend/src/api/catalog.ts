import type { CatalogFeat, CatalogSpell, Item, ReferenceData } from "@/types/character";
import { request } from "@/api/http";

export async function fetchReference(): Promise<ReferenceData> {
  return request<ReferenceData>("/reference", undefined, "Failed to fetch reference data");
}

// Feeds the inventory editor's "add from catalog" picker (Phase B).
export async function fetchItems(): Promise<Item[]> {
  return request<Item[]>("/items", undefined, "Failed to fetch items");
}

// Feeds the spellcasting section's "learn from catalog" picker.
// Ordered by level then name server-side; no client-side re-sort needed.
export async function fetchSpells(): Promise<CatalogSpell[]> {
  return request<CatalogSpell[]>("/spells", undefined, "Failed to fetch spell catalog");
}

// Feeds the advancement section's feat picker — same role as fetchManeuvers.
// Ordered alphabetically server-side.
export async function fetchFeats(): Promise<CatalogFeat[]> {
  return request<CatalogFeat[]>("/feats", undefined, "Failed to fetch feat catalog");
}
