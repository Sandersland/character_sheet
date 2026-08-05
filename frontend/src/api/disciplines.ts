/**
 * Way of the Four Elements discipline catalog + cast endpoint (#1505). Split
 * out of abilities.ts (the 250-line-per-module ceiling, barrel.test.ts) —
 * every other ability family already gets its own file at this size
 * (channel-divinity's cast lives in abilities.ts only because it's small;
 * this one earns its own module the same way shadow-arts' route did on the
 * backend).
 */

import type { CatalogDiscipline, Character, DisciplineOperation } from "@/types/character";
import { applyAbilityTransactions } from "@/api/abilities";
import { request } from "@/api/http";
import type { RulesEdition } from "@character-sheet/shared-types";

// Feeds the Way of the Four Elements monk's discipline list/cast UI — mirrors
// fetchShadowArts, with `edition` required for the same reason as
// fetchManeuvers (#1412). Each row carries `steps`: every selectable ki
// amount paired with its resolved roll, so the cast picker never computes
// the ki-scaled dice count itself.
export async function fetchDisciplines(edition: RulesEdition): Promise<CatalogDiscipline[]> {
  return request<CatalogDiscipline[]>(`/disciplines?edition=${edition}`, undefined, "Failed to fetch discipline catalog");
}

// Casts a known elemental discipline: spends the requested ki (or the
// discipline's base cost when omitted), server-validates the client-rolled
// damage, and — for a concentrating discipline — establishes concentration.
// Returns the updated Character; the "disciplines" ability handler defines
// no `respond`, so (unlike castManeuverTransaction) there is no per-op
// results array — the cast's roll/DC narration lives in the persisted audit
// event instead (self-or-announce, CLAUDE.md), surfaced generically by the
// session log.
export async function castDisciplineTransaction(
  characterId: string,
  operations: DisciplineOperation[],
): Promise<Character> {
  return applyAbilityTransactions(characterId, "disciplines", operations, "Failed to cast discipline");
}
