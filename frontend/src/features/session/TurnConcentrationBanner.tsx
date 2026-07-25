// Read-only concentration mirror for the turn UI (#735). Surfaces the character's
// active concentration during combat with a Drop button, so a player doesn't
// have to switch to the Spells tab mid-turn. The concentration SAVE-on-damage
// prompt stays owned by HitPointTracker (epic #728, Decision #6) — this banner
// only mirrors state + ends concentration; it never prompts a save.

import SpellStatusBanners from "@/features/spells/SpellStatusBanners";
import { applySpellcastingTransactions } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { Character } from "@/types/character";

export default function TurnConcentrationBanner({
  character,
  onUpdate,
  onLogChanged,
}: {
  character: Character;
  onUpdate: (c: Character) => void;
  onLogChanged: () => void;
}) {
  const mutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: () => applySpellcastingTransactions(character.id, [{ type: "dropConcentration" }]),
    toCharacter: (c) => c,
    fallbackMessage: "Failed to drop concentration.",
    onCharacterWritten: onUpdate,
  });
  const concentratingOn = character.spellcasting?.concentratingOn ?? null;
  if (!concentratingOn) return null;

  async function drop() {
    try {
      await mutation.mutateAsync(undefined);
      onLogChanged();
    } catch {
      // mutation.error already carries the message; no UI surface here (mirrors pre-#1283).
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
