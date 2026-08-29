import { useQuery } from "@tanstack/react-query";

import { fetchCharacters } from "@/api/client";
import { characterKeys } from "@/api/queryKeys";

export function useCharacterList() {
  const { data, isError } = useQuery({
    queryKey: characterKeys.list(),
    queryFn: fetchCharacters,
  });

  // `error` means "nothing to show" — a failed background refetch must not
  // discard a loaded list.
  return { characters: data ?? null, error: isError && data === undefined };
}
