import { useParams } from "react-router-dom";

import CharacterSheetContent from "@/features/character-meta/CharacterSheetContent";
import CharacterLoadError from "@/features/character-meta/CharacterLoadError";
import Spinner from "@/components/ui/Spinner";
import { useCharacter } from "@/hooks/useCharacter";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { useReferenceData } from "@/hooks/useReferenceData";

export default function CharacterSheetPage() {
  const { id } = useParams();
  const { character, error, setCharacter } = useCharacter(id);
  const { reference } = useReferenceData();
  const showSpinner = useDelayedFlag(character === undefined && !error);

  if (error) return <CharacterLoadError variant="error" />;

  if (character === undefined) {
    return showSpinner ? <Spinner variant="page" /> : null;
  }

  if (character === null) return <CharacterLoadError variant="not-found" characterId={id} />;

  return (
    <CharacterSheetContent
      id={id}
      character={character}
      reference={reference}
      onUpdate={setCharacter}
    />
  );
}
