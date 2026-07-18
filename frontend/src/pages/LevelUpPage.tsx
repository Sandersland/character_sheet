// Route: /characters/:id/level-up — the guided level-up ceremony (#886).
// Load/guard shell on the JournalPage pattern; with nothing pending there is no
// ceremony to run, so it bounces straight back to the sheet.

import { Navigate, useParams } from "react-router-dom";

import Spinner from "@/components/ui/Spinner";
import CharacterLoadError from "@/features/character-meta/CharacterLoadError";
import LevelUpCeremony from "@/features/level-up/LevelUpCeremony";
import { useCharacter } from "@/hooks/useCharacter";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { levelUpPageState, type LevelUpPageState } from "@/lib/levelUpPageState";

interface FallbackContext {
  characterId: string | undefined;
  showSpinner: boolean;
}

const FALLBACK_VIEWS: Record<Exclude<LevelUpPageState["kind"], "ready">, (ctx: FallbackContext) => React.ReactElement | null> = {
  loading: ({ showSpinner }) => (showSpinner ? <Spinner variant="page" /> : null),
  error: () => <CharacterLoadError variant="error" />,
  "not-found": ({ characterId }) => <CharacterLoadError variant="not-found" characterId={characterId} />,
  "no-pending": ({ characterId }) => <Navigate to={`/characters/${characterId}`} replace />,
};

export default function LevelUpPage() {
  const { id } = useParams();
  const { character, error } = useCharacter(id);
  const state: LevelUpPageState = error ? { kind: "error" } : levelUpPageState(character);
  const showSpinner = useDelayedFlag(state.kind === "loading");

  if (state.kind === "ready") return <LevelUpCeremony character={state.character} />;
  return FALLBACK_VIEWS[state.kind]({ characterId: id, showSpinner });
}
