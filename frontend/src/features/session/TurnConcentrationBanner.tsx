import SpellStatusBanners from "@/features/spells/SpellStatusBanners";
import { applySpellcastingTransactions } from "@/api/client";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";

export default function TurnConcentrationBanner({
  onLogChanged,
}: {
  onLogChanged: () => void;
}) {
  const { character } = useCurrentCharacter();
  const mutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: () => applySpellcastingTransactions(character.id, [{ type: "dropConcentration" }]),
    toCharacter: (c) => c,
    fallbackMessage: "Failed to drop concentration.",
  });
  const concentratingOn = character.spellcasting?.concentratingOn ?? null;
  if (!concentratingOn) return null;

  async function drop() {
    try {
      await mutation.mutateAsync(undefined);
      onLogChanged();
    } catch {
      // mutation.error already carries the message; no UI surface needed here.
    }
  }

  return (
    <SpellStatusBanners
      concentratingOn={concentratingOn}
      dismissibleSpellBuffs={[]}
      busy={mutation.isPending}
      onDropConcentration={drop}
      onDismissBuff={() => {}}
    />
  );
}
