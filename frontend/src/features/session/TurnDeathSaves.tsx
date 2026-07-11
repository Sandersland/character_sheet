// Inline death-save controls for the turn UI (#736). When a player drops to 0 HP
// they can roll death saves / be stabilized without leaving the turn surface for
// the Rest & HP tab. Reuses the shared useDeathSaves hook (same ops as
// HitPointTracker) and the presentational DeathSaveTracker. Self-gates to null
// above 0 HP, so it adds no conditional complexity to TurnHub.

import DeathSaveTracker from "@/features/hitpoints/DeathSaveTracker";
import { useDeathSaves } from "@/features/hitpoints/useDeathSaves";
import type { Character } from "@/types/character";

export default function TurnDeathSaves({
  character,
  onUpdate,
}: {
  character: Character;
  onUpdate: (c: Character) => void;
}) {
  const { isDying, deathSaves, pending, onRollDeathSave, onStabilize } = useDeathSaves(
    character,
    onUpdate,
  );
  if (!isDying) return null;

  return (
    <div className="rounded-card border border-garnet-300 bg-garnet-50 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-garnet-700">
        Dying — death saves
      </p>
      <DeathSaveTracker
        deathSaves={deathSaves}
        pending={pending}
        onRollDeathSave={onRollDeathSave}
        onStabilize={onStabilize}
      />
    </div>
  );
}
