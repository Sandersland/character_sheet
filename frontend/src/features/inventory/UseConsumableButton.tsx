import { Beaker } from "lucide-react";

import { useRoll } from "@/features/dice/RollContext";
import type { InventoryItem, InventoryOperation } from "@/types/character";

interface UseConsumableButtonProps {
  item: InventoryItem;
  pending: boolean;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
}

// "Use" affordance for a consumable row (#121). Stackable items decrement
// quantity; charged items decrement usesRemaining and disable at 0 until a long
// rest recharges. When the consumable has effect dice, the player's roll plays
// the 3D dice animation + result toast; the server applies the effect (healing
// auto-applies, other effects are recorded only).
export default function UseConsumableButton({ item, pending, onSubmit }: UseConsumableButtonProps) {
  const { rollAnimated } = useRoll();
  const consumable = item.consumable;
  const charged = consumable?.maxUses != null;
  const depleted = charged && (consumable?.usesRemaining ?? 0) <= 0;

  const handleUse = () => {
    if (consumable?.effectDiceCount && consumable.effectDiceFaces) {
      rollAnimated(
        {
          count: consumable.effectDiceCount,
          faces: consumable.effectDiceFaces,
          modifier: consumable.effectModifier ?? 0,
        },
        `${item.name}${consumable.effectDescription ? ` — ${consumable.effectDescription}` : ""}`,
      );
    }
    void onSubmit([{ type: "use", inventoryItemId: item.id }]);
  };

  return (
    <button
      type="button"
      disabled={pending || depleted}
      onClick={handleUse}
      aria-label={`Use ${item.name}`}
      className="flex h-7 items-center gap-1 rounded-control px-2 text-xs font-semibold text-garnet-700 transition-colors hover:bg-parchment-200 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600"
    >
      <Beaker aria-hidden="true" className="h-3.5 w-3.5" />
      Use
      {charged && (
        <span className="tabular-nums text-parchment-600">
          {consumable?.usesRemaining ?? 0}/{consumable?.maxUses}
        </span>
      )}
    </button>
  );
}
