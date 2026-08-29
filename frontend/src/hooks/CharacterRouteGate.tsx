import { useParams } from "react-router-dom";
import type { ReactNode } from "react";

import Spinner from "@/components/ui/Spinner";
import CharacterLoadError from "@/features/character-meta/CharacterLoadError";
import { CurrentCharacterProvider } from "@/hooks/CurrentCharacterProvider";
import { useCharacter } from "@/hooks/useCharacter";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";

export function CharacterRouteGate({ children }: { children: ReactNode }) {
  const { id } = useParams();
  const { character, error } = useCharacter(id);
  const showSpinner = useDelayedFlag(character === undefined && !error);

  if (error) return <CharacterLoadError variant="error" />;

  if (character === undefined) {
    return showSpinner ? <Spinner variant="page" /> : null;
  }

  if (character === null) return <CharacterLoadError variant="not-found" characterId={id} />;

  return <CurrentCharacterProvider id={character.id}>{children}</CurrentCharacterProvider>;
}
