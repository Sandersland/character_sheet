// Loads the GET /api/spells catalog once; delayed spinner flag to avoid flicker.
import { useEffect, useState } from "react";

import { fetchSpells } from "@/api/client";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import type { CatalogSpell } from "@/types/character";

export function useSpellCatalog() {
  const [catalog, setCatalog] = useState<CatalogSpell[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const showSpinner = useDelayedFlag(catalog === null && !error);

  useEffect(() => {
    let mounted = true;
    fetchSpells()
      .then((spells) => { if (mounted) setCatalog(spells); })
      .catch(() => { if (mounted) setError("Couldn't load spell catalog."); });
    return () => { mounted = false; };
  }, []);

  return { catalog, error, showSpinner };
}
