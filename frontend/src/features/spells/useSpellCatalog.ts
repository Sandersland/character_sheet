import { useEffect, useState } from "react";

import { fetchSpells, type SpellCatalogFilter } from "@/api/client";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import type { CatalogSpell } from "@/types/character";
import type { RulesEdition } from "@character-sheet/shared-types";

// refreshKey has the same `unknown` escape-hatch type as SessionLog's own refresh prop — if you change one, check the other.
export function useSpellCatalog(edition: RulesEdition, filter?: SpellCatalogFilter, refreshKey?: unknown) {
  const [catalog, setCatalog] = useState<CatalogSpell[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const showSpinner = useDelayedFlag(catalog === null && !error);
  // Destructured so the effect depends on primitives, not a fresh object identity every render (would refetch in a loop).
  const className = filter?.className;
  const maxLevel = filter?.maxLevel;
  const subclassId = filter?.subclassId;
  // #1811: characterId is forwarded so the server resolves granted/campaign spell entries for that character's campaign (see SpellCatalogFilter).
  const characterId = filter?.characterId;

  useEffect(() => {
    let mounted = true;
    fetchSpells(edition, { className, maxLevel, subclassId, characterId })
      .then((spells) => {
        if (!mounted) return;
        setCatalog(spells);
        setError(null);
      })
      // #1840: dropping the old catalog on failure keeps the UI from showing a loaded list next to an error banner at the same time.
      .catch(() => {
        if (!mounted) return;
        setError("Couldn't load spell catalog.");
        setCatalog(null);
      });
    return () => { mounted = false; };
  }, [edition, className, maxLevel, subclassId, characterId, refreshKey]);

  return { catalog, error, showSpinner };
}
