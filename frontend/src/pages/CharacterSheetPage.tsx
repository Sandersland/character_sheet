import { useParams } from "react-router-dom";

import CharacterSheetContent from "@/features/character-meta/CharacterSheetContent";
import CharacterLoadError from "@/features/character-meta/CharacterLoadError";
import Spinner from "@/components/ui/Spinner";
import { CurrentCharacterProvider } from "@/hooks/CurrentCharacterProvider";
import { useCharacter } from "@/hooks/useCharacter";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";

// Loads the character, decides load/error/not-found, then mounts
// CurrentCharacterProvider — everything below (including reference data) is
// read via hooks, not props (#1284 C17).
export default function CharacterSheetPage() {
  const { id } = useParams();
  const { character, error } = useCharacter(id);
  const showSpinner = useDelayedFlag(character === undefined && !error);

  if (error) return <CharacterLoadError variant="error" />;

  if (character === undefined) {
    return showSpinner ? <Spinner variant="page" /> : null;
  }

  if (character === null) return <CharacterLoadError variant="not-found" characterId={id} />;

  return (
    <CurrentCharacterProvider id={character.id}>
      <CharacterSheetContent />
    </CurrentCharacterProvider>
  );
}
