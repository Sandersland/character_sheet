// Inline death-save controls for the turn UI (#736). When a player drops to 0 HP
// they can roll death saves / be stabilized without leaving the turn surface for
// the Rest & HP tab. Reuses the shared useDeathSaves hook (same ops as
// HitPointTracker) and the presentational DeathSaveTracker. Self-gates to null
// above 0 HP, so it adds no conditional complexity to TurnHub.

import DeathSaveTracker from "@/features/hitpoints/DeathSaveTracker";
import { useDeathSaves } from "@/features/hitpoints/useDeathSaves";
import type { Character } from "@/types/character";

export default function TurnDeathSaves({ character }: { character: Character }) {
  const { isDying, deathSaves, pending, error, onRollDeathSave, onStabilize } =
    useDeathSaves(character);
  if (!isDying) return null;

  // DeathSaveTracker supplies its own garnet card + heading, so render it
  // directly (no wrapping card) — the same way HitPointTracker does (#744).
  return (
    <>
      <DeathSaveTracker
        deathSaves={deathSaves}
        pending={pending}
        onRollDeathSave={onRollDeathSave}
        onStabilize={onStabilize}
      />
      {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}
    </>
  );
}
