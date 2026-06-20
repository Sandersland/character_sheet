import { useEffect, useState } from "react";

import { fetchCharacters } from "@/api/client";
import type { CharacterSummary } from "@/types/character";

export function useCharacterList() {
  const [characters, setCharacters] = useState<CharacterSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    setError(false);
    fetchCharacters()
      .then((data) => {
        if (mounted) setCharacters(data);
      })
      .catch(() => {
        if (mounted) setError(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return { characters, error };
}
