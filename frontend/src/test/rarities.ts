import { getQueryClient } from "@/api/queryClient";
import { referenceKeys } from "@/api/queryKeys";
import type { ItemRarityOption } from "@/types/character";
import type { RulesEdition } from "@character-sheet/shared-types";

/** The six rows GET /api/reference serves (#1437), verbatim off the wire. */
// fallow-ignore-next-line code-duplication -- a wire fixture must state the exact rows the server sends; its clone of ITEM_RARITIES is the assertion, and reference.test.ts pins the real response against the same values
export const SERVED_RARITIES: ItemRarityOption[] = [
  { key: "COMMON", label: "Common", standardValueGp: 100 },
  { key: "UNCOMMON", label: "Uncommon", standardValueGp: 400 },
  { key: "RARE", label: "Rare", standardValueGp: 4000 },
  { key: "VERY_RARE", label: "Very Rare", standardValueGp: 40000 },
  { key: "LEGENDARY", label: "Legendary", standardValueGp: 200000 },
  { key: "ARTIFACT", label: "Artifact", standardValueGp: null },
];

/** Seeds the reference cache so useItemRarities resolves with no fetch — the
 *  staleTime: Infinity entry is permanently fresh, so the query never fires. */
export function seedItemRarities(edition: RulesEdition, itemRarities = SERVED_RARITIES): void {
  getQueryClient().setQueryData(referenceKeys.byEdition(edition), {
    races: [],
    classes: [],
    backgrounds: [],
    alignments: [],
    artisanTools: [],
    conditions: [],
    itemRarities,
  });
}
