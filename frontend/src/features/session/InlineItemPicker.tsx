/**
 * InlineItemPicker — inline consumable-item list for the TurnHub's item resolution.
 *
 * Lists consumable inventory items. On Use: rolls heal dice if present, sends
 * applyActionTransactions with the roll total, and calls onUpdate + onClose.
 */

import { useState } from "react";

import { applyActionTransactions } from "@/api/client";
import { rollSpec } from "@/lib/dice";
import type { Character } from "@/types/character";

interface InlineItemPickerProps {
  character: Character;
  onUpdate: (c: Character) => void;
  onClose: () => void;
}

export default function InlineItemPicker({
  character,
  onUpdate,
  onClose,
}: InlineItemPickerProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const consumables = character.inventory.filter((i) => i.category === "consumable");

  async function handleUse(itemId: string) {
    const item = consumables.find((i) => i.id === itemId);
    if (!item || busy) return;

    setBusy(true);
    setError(null);

    try {
      const c = item.consumable;
      let roll: number | undefined;

      // Roll heal/effect dice if the item has them.
      if (c && c.effectDiceCount && c.effectDiceFaces) {
        const result = rollSpec({
          count: c.effectDiceCount,
          faces: c.effectDiceFaces,
          modifier: c.effectModifier ?? 0,
        });
        roll = result.total;
      }

      const updated = await applyActionTransactions(character.id, [
        { type: "executeAction", actionKey: "useObject", inventoryItemId: itemId, ...(roll !== undefined ? { roll } : {}) },
      ]);

      onUpdate(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to use item.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {consumables.length === 0 ? (
        <p className="py-3 text-sm text-parchment-600">No consumable items in inventory.</p>
      ) : (
        <div className="flex flex-col divide-y divide-parchment-200">
          {consumables.map((item) => {
            const c = item.consumable;
            const hasDice = c && c.effectDiceCount && c.effectDiceFaces;
            const effectLabel = hasDice
              ? `${c!.effectDiceCount}d${c!.effectDiceFaces}${c!.effectModifier ? ` + ${c!.effectModifier}` : ""}`
              : c?.effectDescription ?? null;

            return (
              <div key={item.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-parchment-900">{item.name}</p>
                  <p className="text-xs text-parchment-600">
                    Qty: {item.quantity}
                    {effectLabel && (
                      <span className="ml-1.5 text-vitality-700">{effectLabel}</span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy || item.quantity <= 0}
                  onClick={() => handleUse(item.id)}
                  className="rounded-control border border-vitality-200 bg-vitality-50 px-2.5 py-1 text-xs font-semibold text-vitality-700 transition-colors hover:bg-vitality-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Use
                </button>
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <p className="mt-1.5 text-xs font-semibold text-garnet-700">{error}</p>
      )}
    </div>
  );
}
