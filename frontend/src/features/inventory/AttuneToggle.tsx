import { describeAttunementPrereq } from "@/lib/capabilities";
import type { InventoryItem, InventoryOperation } from "@/types/character";

interface AttuneToggleProps {
  item: InventoryItem;
  pending: boolean;
  /** True when 3 items are already attuned — blocks attuning a new one (5e cap). */
  atCap: boolean;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
}

// The attune/unattune pill, shown only for items that require attunement.
// Attuning a new item is blocked at the derived 3-item cap; the server also
// enforces the snapshotted prerequisite and surfaces the reason on attempt.
export default function AttuneToggle({ item, pending, atCap, onSubmit }: AttuneToggleProps) {
  const blocked = !item.attuned && atCap;
  const prereq = item.attunementPrereqKind
    ? `Requires attunement by ${describeAttunementPrereq(item.attunementPrereqKind, item.attunementPrereqValue)}`
    : "Requires attunement";
  const title = blocked ? "At attunement limit (3/3) — unattune one first" : prereq;
  return (
    <button
      type="button"
      disabled={pending || blocked}
      aria-pressed={item.attuned}
      title={title}
      onClick={() =>
        onSubmit([{ type: item.attuned ? "unattune" : "attune", inventoryItemId: item.id }])
      }
      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        item.attuned
          ? "border-arcane-300 bg-arcane-50 text-arcane-800 hover:bg-arcane-100"
          : "border-parchment-300 bg-parchment-50 text-parchment-700 hover:bg-parchment-100"
      }`}
    >
      {item.attuned ? "Attuned" : "Attune"}
    </button>
  );
}
