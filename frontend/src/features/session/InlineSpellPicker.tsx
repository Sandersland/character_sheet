/**
 * InlineSpellPicker — inline spell list for the TurnHub's spell resolution.
 *
 * Mirrors InlineAttackPicker.tsx in structure. For each prepared/known spell
 * castable right now (cantrip always; leveled spells need a remaining slot ≥
 * spell level) the player can pick a slot level (upcast), pick a target
 * (self/other), and cast. Attack spells are a two-step: Attack rolls the d20
 * and consumes the economy slot, then Cast rolls damage.
 *
 * This is a thin shell: selection/slot predicates live in `lib/spellPicker`,
 * state + orchestration in `useSpellPicker`, and per-row rendering in
 * `SpellPickerRow` (with `SlotLevelSelector` + `SpellTargetToggle`). All roll
 * results surface in the global RollResultToast; "Done" closes the panel.
 */

import { useSpellPicker } from "@/features/session/useSpellPicker";
import SpellPickerRow from "@/features/session/SpellPickerRow";
import type { AllyOption } from "@/lib/spellMeta";
import type { Character } from "@/types/character";
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
    <div className="flex flex-col gap-0">
      {picker.slotUsedHint && (
        <p className="mb-2 rounded bg-parchment-100 px-3 py-2 text-[11px] font-semibold text-parchment-600">
          {picker.slotUsedHint}
        </p>
      )}

      {picker.sortedSpells.map((spell) => {
        const row = picker.rowFor(spell);
        return (
          <SpellPickerRow
            key={spell.id}
            spell={spell}
            view={picker.viewFor(spell, row)}
            row={row}
            onPatch={(patch) => picker.patchRow(spell.id, patch)}
            onCast={() => picker.handleCast(spell)}
            onAttackRoll={() => picker.handleAttackRoll(spell)}
          />
        );
      })}

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
