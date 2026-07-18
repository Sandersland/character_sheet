// Route: /characters/:id/level-up — the guided level-up ceremony (#886).
// Load/guard shell on the JournalPage pattern; with nothing pending there is no
// ceremony to run, so it bounces straight back to the sheet.

import { Navigate, useParams } from "react-router-dom";

import Spinner from "@/components/ui/Spinner";
import CharacterLoadError from "@/features/character-meta/CharacterLoadError";
import LevelUpCeremony from "@/features/level-up/LevelUpCeremony";
import { useCharacter } from "@/hooks/useCharacter";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";

export default function LevelUpPage() {
  const { id } = useParams();
  const { character, error } = useCharacter(id);
  const showSpinner = useDelayedFlag(character === undefined && !error);

  if (error) return <CharacterLoadError variant="error" />;
  if (character === undefined) return showSpinner ? <Spinner variant="page" /> : null;
  if (character === null) return <CharacterLoadError variant="not-found" characterId={id} />;
  if (character.pendingLevelUps === 0) return <Navigate to={`/characters/${character.id}`} replace />;

  return <LevelUpCeremony character={character} />;
}
