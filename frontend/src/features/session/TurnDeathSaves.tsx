import DeathSaveTracker from "@/features/hitpoints/DeathSaveTracker";
import { useDeathSaves } from "@/features/hitpoints/useDeathSaves";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";

export default function TurnDeathSaves() {
  const { character } = useCurrentCharacter();
  const { isDying, deathSaves, pending, error, onRollDeathSave, onStabilize } =
    useDeathSaves(character);
  if (!isDying) return null;

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
