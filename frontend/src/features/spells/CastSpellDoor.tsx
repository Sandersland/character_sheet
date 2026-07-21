/**
 * CastSpellDoor — the record view's single casting entry point (#1162). Replaces
 * the old per-row quick-cast pills: one "Cast a spell" button opens an in-place
 * picker over the castable roster (at-will cantrips + prepared leveled spells
 * with a slot to spend, deriveCastableSpells), and tapping a spell opens the SAME
 * shared SpellDetailCard the grimoire and the in-session cast sheet use — reusing
 * SlotLevelSelector for the upcast step rather than hand-rolling a second one
 * (mirrors CastSpellDetailSheet, #1163, which can't be reused directly here: it's
 * typed against the session turn-economy picker, and camp casting has no turn to
 * spend).
 *
 * While a session is live, casting belongs to the Combat tab (its economy/roll
 * log is the source of truth), so the door defers there instead of opening.
 */
import { useState } from "react";

import { deriveCastableSpells } from "@/lib/preparedSpells";
import { availableSlotsForSpell } from "@/lib/spellPicker";
import { slotOrdinal } from "@/lib/spellMeta";
import SpellDetailCard from "@/features/spells/SpellDetailCard";
import SlotLevelSelector from "@/features/session/SlotLevelSelector";
import type { Character, Spell } from "@/types/character";

interface CastSpellDoorProps {
  character: Character;
  derived: { availableSlotLevels: number[]; availableArcanaLevels: number[] };
  busy: boolean;
  /** A live session is active — casting defers to the Combat tab instead of opening the picker. */
  isLive: boolean;
  onCast: (spell: Spell, slotLevel?: number) => void;
  onGoToCombat: () => void;
}

function CastableRow({ spell, onOpen }: { spell: Spell; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        aria-label={`Open ${spell.name}`}
        onClick={onOpen}
        className="flex w-full items-center gap-2.5 border-b border-dotted border-parchment-200 py-2 text-left last:border-b-0 hover:bg-parchment-50"
      >
        <span className="font-medium text-parchment-900">{spell.name}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-parchment-500">
          {spell.level === 0 ? "Cantrip" : slotOrdinal(spell.level)}
        </span>
      </button>
    </li>
  );
}

// The in-place picker box (not a live session): empty state or the castable rows.
function CastPickerList({ castable, onOpen }: { castable: Spell[]; onOpen: (spell: Spell) => void }) {
  return (
    <div className="rounded-card border border-parchment-200 bg-parchment-50 p-3">
      {castable.length === 0 ? (
        <p className="py-2 text-center text-xs text-parchment-600">No castable spells right now.</p>
      ) : (
        <ul className="flex flex-col">
          {castable.map((spell) => (
            <CastableRow key={spell.id} spell={spell} onOpen={() => onOpen(spell)} />
          ))}
        </ul>
      )}
    </div>
  );
}

// The live-session hint under the door button: casting defers to Combat instead.
function LiveNotice() {
  return (
    <p className="rounded-control bg-parchment-100 px-3 py-2 text-xs text-parchment-600">
      In a live session, casting happens on the <span className="font-semibold">Combat</span> tab —
      this door takes you there.
    </p>
  );
}

export default function CastSpellDoor({ character, derived, busy, isLive, onCast, onGoToCombat }: CastSpellDoorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailSpellId, setDetailSpellId] = useState<string | null>(null);
  const [slotLevel, setSlotLevel] = useState<number | undefined>(undefined);

  const castable = deriveCastableSpells(character, derived.availableSlotLevels, derived.availableArcanaLevels);
  const detailSpell = castable.find((s) => s.id === detailSpellId);
  const availableSlots = detailSpell
    ? availableSlotsForSpell(detailSpell, derived.availableSlotLevels, derived.availableArcanaLevels)
    : [];
  const resolvedLevel = slotLevel ?? availableSlots[0];

  function handleDoorClick() {
    if (isLive) {
      onGoToCombat();
      return;
    }
    setPickerOpen((open) => !open);
  }

  function openDetail(spell: Spell) {
    setSlotLevel(undefined);
    setDetailSpellId(spell.id);
  }

  function handleCastPress() {
    if (!detailSpell) return;
    onCast(detailSpell, detailSpell.level === 0 ? undefined : resolvedLevel);
    setDetailSpellId(null);
    setPickerOpen(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleDoorClick}
        className="rounded-lg bg-garnet-700 py-2.5 text-center text-sm font-semibold text-parchment-50 hover:bg-garnet-800"
      >
        Cast a spell
      </button>

      {isLive && <LiveNotice />}
      {/* handleDoorClick only ever sets pickerOpen while !isLive, so isLive &&
          pickerOpen is unreachable — no extra guard needed here. */}
      {pickerOpen && <CastPickerList castable={castable} onOpen={openDetail} />}

      {detailSpell && (
        <SpellDetailCard
          spell={detailSpell}
          onClose={() => setDetailSpellId(null)}
          belowDescription={
            detailSpell.level > 0 ? (
              <SlotLevelSelector
                spell={detailSpell}
                availableSlots={availableSlots}
                spellSlot={resolvedLevel}
                onSelect={setSlotLevel}
              />
            ) : undefined
          }
          cta={{
            label: busy ? "Casting…" : `Cast ${detailSpell.name}`,
            disabled: busy,
            onPress: handleCastPress,
          }}
        />
      )}
    </div>
  );
}
