// Loads the GET /api/spells catalog; delayed spinner flag to avoid flicker.
// An optional filter is forwarded to the server (#1377) — the creation ceremony
// narrows to one class's legal band, the sheet's picker takes everything.
import { useEffect, useState } from "react";

import { fetchSpells, type SpellCatalogFilter } from "@/api/client";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import type { CatalogSpell } from "@/types/character";
import type { RulesEdition } from "@character-sheet/shared-types";

// `edition` is required (#1712): every caller already has the viewing
// character's edition (or the creation draft's chosen one) in hand, so
// threading it through here is what keeps the picker from ever offering a
// cross-edition row.
//
// `refreshKey` (#1787) is an opt-in manual-refetch trigger, same `unknown`
// escape-hatch shape as SessionLog's own prop: GET /api/spells is not on
// TanStack Query here (unlike GET /api/reference's useReferenceData), so
// there is no query key to invalidate — a caller that just wrote a new
// homebrew spell (AddSpellPanel, after createCustomSpell) bumps a counter to
// force this effect to re-run instead.
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
      .then((spells) => { if (mounted) setCatalog(spells); })
      .catch(() => { if (mounted) setError("Couldn't load spell catalog."); });
    return () => { mounted = false; };
  }, [edition, className, maxLevel, subclassId, characterId, refreshKey]);

  return { catalog, error, showSpinner };
}
