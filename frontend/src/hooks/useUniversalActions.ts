import { useReferenceData } from "@/hooks/useReferenceData";
import type { UniversalActionOption } from "@/types/character";
import type { RulesEdition } from "@character-sheet/shared-types";

// Module-level, so an unresolved cache returns the SAME array every render:
// consumers put these rows in useMemo/useEffect dependency arrays, and a fresh
// [] per render would re-run them forever.
const EMPTY: UniversalActionOption[] = [];

/**
 * The universal turn actions served by GET /api/reference (#1430), already
 * resolved for `edition` and ordered by name. Empty until the query resolves —
 * every consumer then renders no universal card at all rather than falling back
 * to a wrong-edition list: a missing card degrades, a wrong-edition card lies.
 */
export function useUniversalActions(edition: RulesEdition | null | undefined): UniversalActionOption[] {
  const { reference } = useReferenceData(edition);
  return reference?.universalActions ?? EMPTY;
}
