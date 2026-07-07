import { useEffect, useState } from "react";

import type { Character, EquipSlot, InventoryItem, InventoryOperation } from "@/types/character";
import EquipSlotCell from "@/features/inventory/EquipSlotCell";
import { GiChestArmor } from "@/components/ui/icons";
import {
  bagItemsForSlot,
  equipSlotLabel,
  isOffHandLocked,
  itemsInSlot,
  RING_CAPACITY,
  SLOT_GROUP_ORDER,
  SLOT_GROUPS,
  type SlotGroup,
} from "@/lib/paperDoll";

interface EquipmentDollProps {
  character: Character;
  pending: boolean;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
}

interface Cell {
  key: string;
  slot: EquipSlot;
  label: string;
  item: InventoryItem | null;
}

// One physical position per slot; RING expands to RING_CAPACITY numbered cells.
function cellsForSlot(inventory: InventoryItem[], slot: EquipSlot): Cell[] {
  const label = equipSlotLabel(slot);
  if (slot === "RING") {
    const rings = itemsInSlot(inventory, "RING");
    return Array.from({ length: RING_CAPACITY }, (_, i) => ({
      key: `RING-${i}`,
      slot,
      label: `${label} ${i + 1}`,
      item: rings[i] ?? null,
    }));
  }
  return [{ key: slot, slot, label, item: itemsInSlot(inventory, slot)[0] ?? null }];
}

// Per-group tile-grid columns: hands is always a 2-up row; the rails are a
// 3-up grid on mobile that collapses to a single column on desktop.
const GROUP_GRID: Record<SlotGroup, string> = {
  hands: "grid-cols-2",
  armor: "grid-cols-3 md:grid-cols-1",
  adornment: "grid-cols-3 md:grid-cols-1",
};

// Desktop placement: armor left rail, adornment right rail, hands bottom-center.
const GROUP_PLACEMENT: Record<SlotGroup, string> = {
  armor: "order-2 md:order-none md:col-start-1 md:row-start-1 md:row-span-2",
  hands: "order-1 md:order-none md:col-start-2 md:row-start-2",
  adornment: "order-3 md:order-none md:col-start-3 md:row-start-1 md:row-span-2",
};

// The interactive "Worn" paper doll (#566): desktop rails + center portrait /
// AC crest, mobile grouped tiles. Consumes the equip op from #565; swaps batch
// an unequip + equip atomically and toast the returned item.
export default function EquipmentDoll({ character, pending, onSubmit }: EquipmentDollProps) {
  const inventory = character.inventory;
  const offHandLocked = isOffHandLocked(inventory);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  function equip(item: InventoryItem, slot: EquipSlot) {
    void onSubmit([{ type: "equip", inventoryItemId: item.id, slot }]);
  }

  function unequip(item: InventoryItem) {
    void onSubmit([{ type: "setEquipped", inventoryItemId: item.id, equipped: false }]);
  }

  async function replace(incoming: InventoryItem, outgoing: InventoryItem, slot: EquipSlot) {
    await onSubmit([
      { type: "setEquipped", inventoryItemId: outgoing.id, equipped: false },
      { type: "equip", inventoryItemId: incoming.id, slot },
    ]);
    setToast(`Returned ${outgoing.name} to your bag.`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[1fr_1.4fr_1fr] md:grid-rows-[auto_1fr] md:items-start md:gap-4">
        {/* Portrait + AC crest — desktop center, hidden on mobile. */}
        <div className="hidden flex-col items-center justify-center gap-2 rounded-card border border-parchment-200 bg-parchment-100 p-4 md:col-start-2 md:row-start-1 md:flex">
          <span className="truncate text-sm font-semibold text-parchment-800">{character.name}</span>
          <div className="flex items-center gap-1.5 rounded-full bg-arcane-700 px-3 py-1 text-parchment-50">
            <GiChestArmor aria-hidden="true" className="size-4" />
            <span className="text-sm font-bold tabular-nums">AC {character.armorClass}</span>
          </div>
        </div>

        {SLOT_GROUP_ORDER.map((group) => {
          const { label, slots } = SLOT_GROUPS[group];
          const cells = slots.flatMap((slot) => cellsForSlot(inventory, slot));
          return (
            <section key={group} className={`flex flex-col gap-1.5 ${GROUP_PLACEMENT[group]}`}>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-parchment-500">
                {label}
              </h4>
              <div className={`grid gap-2 ${GROUP_GRID[group]}`}>
                {cells.map((cell) => {
                  const locked = cell.slot === "OFF_HAND" && offHandLocked;
                  return (
                    <EquipSlotCell
                      key={cell.key}
                      slot={cell.slot}
                      label={cell.label}
                      item={cell.item}
                      locked={locked}
                      lockReason={
                        locked ? "Locked by a two-handed weapon — unequip it first" : undefined
                      }
                      candidates={bagItemsForSlot(inventory, cell.slot)}
                      pending={pending}
                      onEquip={(item) => equip(item, cell.slot)}
                      onUnequip={unequip}
                      onReplace={(incoming, outgoing) => void replace(incoming, outgoing, cell.slot)}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {toast && (
        <p
          role="status"
          className="rounded-control bg-parchment-800 px-3 py-1.5 text-center text-xs font-medium text-parchment-50"
        >
          {toast}
        </p>
      )}
    </div>
  );
}
