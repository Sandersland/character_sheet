import { useEffect, useState } from "react";

import { fetchCharacter } from "@/api/client";
import type { Character } from "@/types/character";

export function useCharacter(id: string | undefined) {
  const [character, setCharacter] = useState<Character | null | undefined>(undefined);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    setCharacter(undefined);
    setError(false);
    fetchCharacter(id)
      .then((data) => {
        if (mounted) setCharacter(data);
      })
      .catch(() => {
        if (mounted) setError(true);
      });
    return () => {
      mounted = false;
    };
  }, [id]);

  return { character, error, setCharacter };
}
