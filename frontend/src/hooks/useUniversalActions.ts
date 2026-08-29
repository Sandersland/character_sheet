import { useReferenceData } from "@/hooks/useReferenceData";
import type { UniversalActionOption } from "@/types/character";
import type { RulesEdition } from "@character-sheet/shared-types";

// Module-level so an unresolved cache returns the same array reference every render, since consumers put it in useMemo/useEffect deps.
const EMPTY: UniversalActionOption[] = [];

/** Empty until the query resolves (#1430): a missing card degrades, a wrong-edition card lies. */
export function useUniversalActions(edition: RulesEdition | null | undefined): UniversalActionOption[] {
  const { reference } = useReferenceData(edition);
  return reference?.universalActions ?? EMPTY;
}
