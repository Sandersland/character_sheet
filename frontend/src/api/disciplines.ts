/** Split out of abilities.ts for the 250-line-per-module ceiling (barrel.test.ts). */

import type { CatalogDiscipline, Character, DisciplineOperation } from "@/types/character";
import { applyAbilityTransactions } from "@/api/abilities";
import { request } from "@/api/http";
import type { RulesEdition } from "@character-sheet/shared-types";

// Each row carries `steps`: every selectable ki amount paired with its
// resolved roll, so the cast picker never computes the ki-scaled dice
// count itself.
export async function fetchDisciplines(edition: RulesEdition): Promise<CatalogDiscipline[]> {
  return request<CatalogDiscipline[]>(`/disciplines?edition=${edition}`, undefined, "Failed to fetch discipline catalog");
}

// Unlike castManeuverTransaction, there is no per-op results array — the
// "disciplines" ability handler defines no `respond`, so roll/DC narration
// lives in the persisted audit event instead (self-or-announce, CLAUDE.md).
export async function castDisciplineTransaction(
  characterId: string,
  operations: DisciplineOperation[],
): Promise<Character> {
  return applyAbilityTransactions(characterId, "disciplines", operations, "Failed to cast discipline");
}
