/**
 * InlineSpellPicker — inline spell list for the TurnHub's spell resolution.
 *
 * Mirrors InlineAttackPicker.tsx in structure. For each prepared/known spell
 * castable right now (cantrip always; leveled spells need a remaining slot ≥
 * spell level) the player can pick a slot level (upcast), pick a target
 * (self/other), and cast. Attack spells are a two-step: Attack rolls the d20
 * and consumes the economy slot, then Cast rolls damage.
 *
 * Spells render grouped into level sections ("Cantrips · at will", "Level N")
 * with slot pips on each leveled header; levels with no affordable slot are
 * hidden entirely, made visible by the footer note ("Level 2+ hidden…").
 * `focusSpellId` opens the picker on a single spell (bonus-spell card
 * pre-selection) with a "Show all spells" escape hatch.
 *
 * This is a thin shell: selection/slot predicates live in `lib/spellPicker`,
 * state + orchestration in `useSpellPicker`, and per-row rendering in
 * `SpellPickerRow` (with `SlotLevelSelector` + `SpellTargetToggle`). All roll
 * results surface in the global RollResultSeal; "Done" closes the panel.
 */

import { useState } from "react";

import { useSpellPicker, type UseSpellPicker } from "@/features/session/useSpellPicker";
import SpellPickerRow from "@/features/session/SpellPickerRow";
import {
  availableArcanaLevels,
  availableSlotLevels,
  groupSpellsByLevel,
  hiddenLevelsNote,
  hiddenSpellLevels,
  slotPipsForLevel,
} from "@/lib/spellPicker";
import type { AllyOption } from "@/lib/spellMeta";
import type { Character, Spell, SpellSlots } from "@/types/character";
import type { SpellCastKind } from "@/features/session/useTurnState";

interface InlineSpellPickerProps {
  character: Character;
  /** Active session id — spell attack rolls are logged against it. */
  sessionId: string;
  onUpdate: (c: Character) => void;
  onClose: () => void;
  /** Called after a roll is logged so the Session Log can refresh. */
  onLogChanged: () => void;
  /** Which economy slot this picker is managing. */
  slot: "action" | "bonusAction" | "reaction";
  /** True when the slot is still available to spend. */
  slotAvailable: boolean;
  /**
   * Called with the spell's level when a cast succeeds, so TurnHub can commit
   * the appropriate action/bonus/reaction slot (and record the spell kind for
   * the 5e bonus-action restriction).
   */
  onCommitSlot: (spellLevel: number) => void;
  /** From useTurnState — used to enforce the 5e bonus-action spell restriction. */
  spellCastThisTurn: { action?: SpellCastKind; bonus?: SpellCastKind };
  /** Opted-in party members a healing cast can target on their sheet (#462). */
  allies: AllyOption[];
  /**
   * Optional filter on casting time. When provided, only spells whose
   * castingTime starts with this prefix are shown (e.g. "1 action",
   * "1 bonus action", "1 reaction"). Applied to ALL spells including cantrips.
   */
  castingTimeFilter?: string;
  /**
   * Open focused on this spellbook entry (bonus-spell card pre-selection).
   * Falls back to the full grouped list if the spell isn't castable anymore.
   */
  focusSpellId?: string;
}

/** "Level 2+ hidden — no slots remaining" footer text, or null. */
function computeHiddenNote(
  spellcasting: Character["spellcasting"],
  castingTimeFilter: string | undefined,
): string | null {
  return hiddenLevelsNote(
    hiddenSpellLevels(spellcasting?.spells ?? [], {
      castingTimeFilter,
      slotLevels: availableSlotLevels(spellcasting?.slots ?? []),
      arcanaLevels: availableArcanaLevels(spellcasting?.arcana ?? []),
      // Deliberately NOT read from spellCastThisTurn: this footer only explains
      // slot-based hiding; economy-rule blocking is surfaced by slotUsedHint.
      bonusActionBlockedByActionSpell: false,
      actionLimitedToCantrips: false,
    }),
  );
}

/** One SpellPickerRow wired to the picker's state/handlers. */
function PickerRow({ picker, spell }: { picker: UseSpellPicker; spell: Spell }) {
  const row = picker.rowFor(spell);
  return (
    <SpellPickerRow
      spell={spell}
      view={picker.viewFor(spell, row)}
      row={row}
      onPatch={(patch) => picker.patchRow(spell.id, patch)}
      onCast={() => picker.handleCast(spell)}
      onAttackRoll={() => picker.handleAttackRoll(spell)}
    />
  );
}

/** Level-section header: label left, slot pips right (never color-only). */
function SpellLevelHeader({ level, slots }: { level: number; slots: SpellSlots[] }) {
  const pips = slotPipsForLevel(slots, level);
  const remaining = pips ? pips.total - pips.used : 0;
  return (
    <div className="flex items-center justify-between pt-2 first:pt-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gold-800">
        {level === 0 ? "Cantrips · at will" : `Level ${level}`}
      </p>
      {pips && (
        <span className="flex items-center gap-1">
          {Array.from({ length: pips.total }).map((_, i) => (
            <span
              key={i}
              aria-hidden
              className={`inline-block h-2 w-2 rounded-full ${
                i < remaining ? "bg-gold-500" : "bg-parchment-300"
              }`}
            />
          ))}
          <span className="sr-only">{`${remaining} of ${pips.total} slots remaining`}</span>
        </span>
      )}
    </div>
  );
}

/** The full grouped list: level sections + rows + hidden-levels footer. */
function GroupedSpellSections({
  picker,
  slots,
  hiddenNote,
}: {
  picker: UseSpellPicker;
  slots: SpellSlots[];
  hiddenNote: string | null;
}) {
  return (
    <>
      {groupSpellsByLevel(picker.sortedSpells).map((group) => (
        <div key={group.level} className="flex flex-col">
          <SpellLevelHeader level={group.level} slots={slots} />
          {group.spells.map((spell) => (
            <PickerRow key={spell.id} picker={picker} spell={spell} />
          ))}
        </div>
      ))}
      {hiddenNote && (
        <p className="pt-2 text-center text-[11px] text-parchment-500">{hiddenNote}</p>
      )}
    </>
  );
}

/** The non-empty picker body: restriction hint, focused row or grouped list, Done. */
function PickerContent({
  picker,
  slots,
  hiddenNote,
  focusSpell,
  onShowAll,
  onClose,
}: {
  picker: UseSpellPicker;
  slots: SpellSlots[];
  hiddenNote: string | null;
  focusSpell: Spell | undefined;
  onShowAll: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-0">
      {picker.slotUsedHint && (
        <p className="mb-2 rounded bg-parchment-100 px-3 py-2 text-[11px] font-semibold text-parchment-600">
          {picker.slotUsedHint}
        </p>
      )}

      {focusSpell ? (
        <>
          <PickerRow picker={picker} spell={focusSpell} />
          <button
            type="button"
            onClick={onShowAll}
            className="self-start pt-2 text-xs font-semibold text-arcane-700 hover:text-arcane-800"
          >
            Show all spells
          </button>
        </>
      ) : (
        <GroupedSpellSections picker={picker} slots={slots} hiddenNote={hiddenNote} />
      )}

      {/* Empty state when the 5e rule blocks everything */}
      {!picker.hasCastable && picker.slotUsedHint && (
        <p className="py-2 text-sm text-parchment-600">No spells available.</p>
      )}

      <div className="pt-3">
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100"
        >
          Done
        </button>
      </div>
    </div>
  );
}

export default function InlineSpellPicker({
  character,
  sessionId,
  onUpdate,
  onClose,
  onLogChanged,
  slot,
  slotAvailable,
  onCommitSlot,
  spellCastThisTurn,
  castingTimeFilter,
  focusSpellId,
  allies,
}: InlineSpellPickerProps) {
  const picker = useSpellPicker({
    character,
    sessionId,
    onUpdate,
    onLogChanged,
    slot,
    slotAvailable,
    onCommitSlot,
    spellCastThisTurn,
    castingTimeFilter,
    allies,
  });

  // Pre-selected spell (bonus-spell card): show just its row until the player
  // asks for the full list. Falls through to the grouped list if the spell
  // stops being castable between open and render.
  const [focusId, setFocusId] = useState<string | null>(focusSpellId ?? null);
  const focusSpell = picker.sortedSpells.find((s) => s.id === focusId);

  const slots = character.spellcasting?.slots ?? [];
  const hiddenNote = computeHiddenNote(character.spellcasting, castingTimeFilter);

  if (picker.isEmpty) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-parchment-600">{picker.emptyMessage}</p>
        <button
          type="button"
          onClick={onClose}
          className="self-start rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-700 hover:bg-parchment-100"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <PickerContent
      picker={picker}
      slots={slots}
      hiddenNote={hiddenNote}
      focusSpell={focusSpell}
      onShowAll={() => setFocusId(null)}
      onClose={onClose}
    />
  );
}
