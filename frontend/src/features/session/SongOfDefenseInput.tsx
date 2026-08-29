import { useState } from "react";

import { QuickBtn } from "@/features/session/TurnControls";
import SlotLevelSelector from "@/features/session/SlotLevelSelector";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";

export default function SongOfDefenseInput({
  onSend,
  onCommit,
  onClose,
}: {
  onSend: (actionKey: string, opts?: { slotLevel?: number }) => Promise<unknown>;
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
      // Commit before send so attachBatchId tags this entry.
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
