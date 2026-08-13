// Loads the GET /api/spells catalog; delayed spinner flag to avoid flicker.
// An optional filter is forwarded to the server (#1377) — the creation ceremony
// narrows to one class's legal band, the sheet's picker takes everything.
import { useEffect, useState } from "react";

import { fetchSpells, type SpellCatalogFilter } from "@/api/client";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import type { CatalogSpell } from "@/types/character";
import type { RulesEdition } from "@character-sheet/shared-types";

// `edition` is required (#1712): every caller already knows the viewing
// character's edition, so this is what keeps the picker from ever offering a
// spell from the other edition.
//
// `refreshKey` (#1787) lets a caller force a re-fetch. It has the same
// `unknown` escape-hatch type as SessionLog's own refresh prop, so if you
// change one, check the other. Some other GET data in this app goes through
// TanStack Query (for example useReferenceData, for GET /api/reference), but
// GET /api/spells does not, so there is no query key to invalidate. Instead,
// a caller that just wrote a new homebrew spell (AddSpellPanel, after
// createCustomSpell) bumps a plain counter, and this effect re-runs.
export function useSpellCatalog(edition: RulesEdition, filter?: SpellCatalogFilter, refreshKey?: unknown) {
  const [catalog, setCatalog] = useState<CatalogSpell[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const showSpinner = useDelayedFlag(catalog === null && !error);
  // Destructured so the effect depends on the primitives, not on a fresh
  // object identity every render (which would refetch in a loop).
  const className = filter?.className;
  const maxLevel = filter?.maxLevel;
  const subclassId = filter?.subclassId;
  // #1811, epic #1795 9/9: the viewing character, forwarded so the server
  // resolves granted/CAMPAIGN entries for that character's campaign — see
  // SpellCatalogFilter's own comment (api/catalog.ts).
  const characterId = filter?.characterId;

  useEffect(() => {
    let mounted = true;
    fetchSpells(edition, { className, maxLevel, subclassId, characterId })
      .then((spells) => {
        if (!mounted) return;
        setCatalog(spells);
        setError(null);
      })
      // A re-fetch (#1840) drops the old rows on failure so the UI never
      // shows a loaded list next to an error banner at the same time.
      .catch(() => {
        if (!mounted) return;
        setError("Couldn't load spell catalog.");
        setCatalog(null);
      });
    return () => { mounted = false; };
  }, [edition, className, maxLevel, subclassId, characterId, refreshKey]);

  return { catalog, error, showSpinner };
}
