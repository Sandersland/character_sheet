import { activationLabel } from "@/lib/activatedEffect";
import type { InventoryItem, InventoryOperation } from "@/types/character";

interface ActivateControlProps {
  item: InventoryItem;
  pending: boolean;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
}

// Activate/deactivate control for an item's activatedEffect capability (#543).
// Shows the activation type + duration reminder, remaining uses, and toggles the
// seeded self-buff. Absent unless the item exposes `activated` (has the capability).
export default function ActivateControl({ item, pending, onSubmit }: ActivateControlProps) {
  const a = item.activated;
  if (!a) return null;

  const outOfUses = a.remainingUses !== null && a.remainingUses <= 0;
  const canActivate = a.available && !outOfUses;
  const usesText =
    a.maxUses === null ? "at will" : `${a.remainingUses}/${a.maxUses} uses left`;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-control bg-parchment-100 px-2.5 py-1.5 text-xs">
      <span className="font-semibold text-parchment-700">{activationLabel(a.activation)}</span>
      <span className="text-parchment-500">·</span>
      <span className="text-parchment-600">{a.reminder}</span>
      <span className="text-parchment-500">·</span>
      <span className={outOfUses ? "text-garnet-700" : "text-parchment-600"}>{usesText}</span>
      <span className="ml-auto">
        {a.active ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => onSubmit([{ type: "deactivate", inventoryItemId: item.id }])}
            className="font-semibold text-garnet-700 hover:underline disabled:opacity-40"
          >
            Deactivate
          </button>
        ) : (
          <button
            type="button"
            disabled={pending || !canActivate}
            title={!a.available ? "Equip or attune this item first" : outOfUses ? "No uses left until a rest" : undefined}
            onClick={() => onSubmit([{ type: "activate", inventoryItemId: item.id }])}
            className="font-semibold text-emerald-700 hover:underline disabled:opacity-40"
          >
            Activate
          </button>
        )}
      </span>
    </div>
  );
}
