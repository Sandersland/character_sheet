/**
 * The cast sheet's "big spell card" (#1163): the shared SpellDetailCard's full
 * description + stat grid, plus the cast controls a combat context needs — an
 * upcast slot picker (only when more than one legal slot exists; SlotLevelSelector
 * already collapses away otherwise) and a full-width Cast. Opened from a row's
 * info dot / body tap; all the whimsy lives here so the compact row stays quiet.
 */

import SpellDetailCard from "@/features/spells/SpellDetailCard";
import SlotLevelSelector from "@/features/session/SlotLevelSelector";
import type { UseSpellPicker } from "@/features/session/useSpellPicker";
import type { Spell } from "@/types/character";

export default function CastSpellDetailSheet({
  spell,
  picker,
  onClose,
}: {
  spell: Spell;
  picker: UseSpellPicker;
  onClose: () => void;
}) {
  const row = picker.rowFor(spell);
  const view = picker.viewFor(spell, row);

  return (
    <SpellDetailCard
      spell={spell}
      onClose={onClose}
      belowDescription={
        <SlotLevelSelector
          spell={spell}
          availableSlots={view.availableSlots}
          spellSlot={view.spellSlot}
          onSelect={(lvl) => picker.patchRow(spell.id, { slotLevel: lvl })}
        />
      }
      cta={{
        label: row.casting ? "Casting…" : `Cast ${spell.name}`,
        disabled: view.castDisabled,
        onPress: () => {
          void picker.handleCast(spell);
          onClose();
        },
      }}
    />
  );
}
