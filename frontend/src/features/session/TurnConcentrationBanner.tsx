// Read-only concentration mirror for the turn UI (#735). Surfaces the character's
// active concentration during combat with a Drop button, so a player doesn't
// have to switch to the Spells tab mid-turn. The concentration SAVE-on-damage
// prompt stays owned by HitPointTracker (epic #728, Decision #6) — this banner
// only mirrors state + ends concentration; it never prompts a save.

import { useState } from "react";
import SpellStatusBanners from "@/features/spells/SpellStatusBanners";
import { applySpellcastingTransactions } from "@/api/client";
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
  const [busy, setBusy] = useState(false);
  const concentratingOn = character.spellcasting?.concentratingOn ?? null;
  if (!concentratingOn) return null;

  async function drop() {
    setBusy(true);
    try {
      const updated = await applySpellcastingTransactions(character.id, [
        { type: "dropConcentration" },
      ]);
      onUpdate(updated);
      onLogChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SpellStatusBanners
      concentratingOn={concentratingOn}
      dismissibleSpellBuffs={[]}
      busy={busy}
      onDropConcentration={drop}
      onDismissBuff={() => {}}
    />
  );
}
