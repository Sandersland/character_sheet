import { useState } from "react";

import { QuickBtn } from "@/features/session/TurnControls";
import SlotLevelSelector from "@/features/session/SlotLevelSelector";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";

/**
 * Slot-level picker for Bladesinger's Song of Defense (#1676) — the deferred
 * UI #1687 (costKind: "slot") left for its first real consumer: the player
 * picks which spell slot to expend on an incoming hit, and this component
 * sends that choice as `slotLevel`. Reuses SlotLevelSelector (the upcast
 * picker InlineSpellPicker's cast sheet already renders, generalized off
 * `Spell` to a plain `baseLevel` for this non-spell consumer) rather than a
 * second hand-rolled level strip. The 5x-slot-level damage reduction is
 * announce text (decision 5, #1676 — no damage-reduction machinery exists),
 * so this component only interpolates the number for display; the player
 * applies it themselves.
 */
export default function SongOfDefenseInput({
  onSend,
  onCommit,
  onClose,
}: {
  onSend: (actionKey: string, opts?: { slotLevel?: number }) => Promise<unknown>;
  /** Commit the reaction slot when the reaction fires (#765's pattern). */
  onCommit: () => void;
  onClose: () => void;
}) {
  const { character } = useCurrentCharacter();
  const availableSlots = (character.spellcasting?.slots ?? []).filter((s) => s.total - s.used > 0);
  const levels = availableSlots.map((s) => s.level);
  const [slotLevel, setSlotLevel] = useState<number | undefined>(levels[0]);
  const [busy, setBusy] = useState(false);

  async function handleUse() {
    if (slotLevel === undefined || busy) return;
    setBusy(true);
    try {
      // Commit first so send's attachBatchId tags this entry (Lay on Hands order).
      onCommit();
      await onSend("songOfDefense", { slotLevel });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  if (availableSlots.length === 0) {
    return (
      <div className="mt-2 rounded-control border border-vitality-200 bg-vitality-50 px-3 py-2 text-xs text-parchment-600">
        No spell slots remaining — Song of Defense can&apos;t be used.
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-control border border-vitality-200 bg-vitality-50 px-3 py-2">
      <span className="text-xs font-semibold text-vitality-700">
        {slotLevel !== undefined
          ? `Expend a level-${slotLevel} slot to reduce the damage by ${slotLevel * 5}`
          : "Expend a slot to reduce the damage by 5 × the slot's level"}
      </span>
      <SlotLevelSelector baseLevel={1} availableSlots={levels} spellSlot={slotLevel} onSelect={setSlotLevel} />
      <div className="flex items-center gap-2">
        <QuickBtn tone="neutral" disabled={busy || slotLevel === undefined} onClick={handleUse}>
          Use Song of Defense
        </QuickBtn>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-xs text-parchment-600 hover:text-parchment-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
