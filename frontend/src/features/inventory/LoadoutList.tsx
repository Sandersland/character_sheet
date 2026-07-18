import { useEffect, useState } from "react";

import type { Character, EquipSlot, InventoryItem, InventoryOperation } from "@/types/character";
import { EQUIP_SLOT_ICONS, Lock, MoreHorizontal, TriangleAlert } from "@/components/ui/icons";
import Badge from "@/components/ui/Badge";
import Popover from "@/components/ui/Popover";
import SlotPickerPanel from "@/features/inventory/SlotPickerPanel";
import AttuneToggle from "@/features/inventory/AttuneToggle";
import { bagItemsForSlot } from "@/lib/paperDoll";
import { attunementSummary, buildLoadoutGroups, type FilledLoadoutRow } from "@/lib/loadout";
import { rarityLabel, rarityTone } from "@/lib/rarity";

interface LoadoutListProps {
  character: Character;
  pending: boolean;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
}

interface FilledRowProps {
  row: FilledLoadoutRow;
  candidates: InventoryItem[];
  pending: boolean;
  onUnequip: (item: InventoryItem) => void;
  onReplace: (incoming: InventoryItem, outgoing: InventoryItem) => void;
}

// A filled row's trailing action popover: Unequip, or Swap → SlotPickerPanel.
function FilledRowActions({ row, candidates, pending, onUnequip, onReplace }: FilledRowProps) {
  const [swapping, setSwapping] = useState(false);
  return (
    <Popover
      align="right"
      label={`${row.label}: ${row.item.name}`}
      onClose={() => setSwapping(false)}
      trigger={
        <span className="flex size-7 items-center justify-center rounded-control text-parchment-500 hover:bg-parchment-100 hover:text-parchment-800">
          <MoreHorizontal aria-hidden="true" className="size-4" />
        </span>
      }
    >
      {swapping ? (
        <div className="w-56 p-3">
          <SlotPickerPanel
            slotLabel={`Swap ${row.label}`}
            candidates={candidates}
            pending={pending}
            action="replace"
            onPick={(incoming) => {
              setSwapping(false);
              onReplace(incoming, row.item);
            }}
            onClose={() => setSwapping(false)}
          />
        </div>
      ) : (
        <div className="flex w-40 flex-col gap-2 p-3 text-xs">
          <button
            type="button"
            disabled={pending}
            onClick={() => onUnequip(row.item)}
            className="text-left font-semibold text-garnet-700 hover:underline disabled:opacity-50"
          >
            Unequip
          </button>
          {candidates.length > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setSwapping(true)}
              className="text-left font-semibold text-arcane-700 hover:underline disabled:opacity-50"
            >
              Swap
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}

// The interactive "Worn" loadout list (#925): grouped Weapons / Armor /
// Accessories rows replacing the rejected tile grid. Reuses the paper-doll slot
// model + equip/unequip ops; swaps batch an unequip + equip atomically.
export default function LoadoutList({ character, pending, onSubmit }: LoadoutListProps) {
  const inventory = character.inventory;
  const groups = buildLoadoutGroups(character);
  const attunement = attunementSummary(inventory);
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
    <div className="flex flex-col gap-4 max-md:gap-3 max-md:pt-2.5">
      <div className="flex items-center justify-end max-md:px-4">
        <span
          className={`text-xs font-semibold ${attunement.atCap ? "text-arcane-700" : "text-parchment-500"}`}
        >
          Attuned {attunement.count}/{attunement.cap}
        </span>
      </div>
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-1.5 max-md:gap-0">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-parchment-500 max-md:border-y max-md:border-parchment-200 max-md:bg-parchment-100 max-md:px-4 max-md:py-1.5">
            {group.label}
          </h4>
          <ul className="flex flex-col gap-1.5">
            {group.rows.map((row) => {
              const Icon = EQUIP_SLOT_ICONS[row.slot];
              if (row.kind === "locked") {
                return (
                  <li
                    key={row.key}
                    className="flex items-center gap-2 rounded-card border border-dashed border-parchment-200 bg-parchment-50/50 px-3 py-2 max-md:rounded-none max-md:border-0 max-md:border-b max-md:border-solid max-md:px-4"
                  >
                    <Lock aria-hidden="true" className="size-4 shrink-0 text-parchment-400" />
                    <span className="flex-1 text-xs font-medium text-parchment-500">{row.label}</span>
                    <span className="text-xs text-parchment-500">
                      Held by {row.lockedByName} (two-handed)
                    </span>
                  </li>
                );
              }
              if (row.kind === "empty") {
                return (
                  <li
                    key={row.key}
                    className="flex items-center gap-2 rounded-card border border-dashed border-parchment-200 bg-parchment-50/50 px-3 py-2 max-md:rounded-none max-md:border-0 max-md:border-b max-md:border-solid max-md:px-4"
                  >
                    <Icon aria-hidden="true" className="size-5 shrink-0 text-parchment-300" />
                    <span className="flex-1 text-xs font-medium text-parchment-500">{row.label}</span>
                    <Popover
                      align="right"
                      label={`Equip ${row.label}`}
                      trigger={
                        <span className="rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-xs font-semibold text-garnet-700 hover:bg-parchment-100">
                          ＋ Equip
                        </span>
                      }
                    >
                      {(close) => (
                        <div className="w-56 p-3">
                          <SlotPickerPanel
                            slotLabel={`Equip ${row.label}`}
                            candidates={bagItemsForSlot(inventory, row.slot)}
                            pending={pending}
                            action="equip"
                            onPick={(picked) => {
                              close();
                              equip(picked, row.slot);
                            }}
                            onClose={close}
                          />
                        </div>
                      )}
                    </Popover>
                  </li>
                );
              }
              const { item, notProficient, grip } = row;
              return (
                <li
                  key={row.key}
                  className="flex items-center gap-2 rounded-card border border-parchment-200 bg-parchment-50 px-3 py-2 max-md:rounded-none max-md:border-0 max-md:border-b max-md:px-4"
                >
                  <Icon aria-hidden="true" className="size-5 shrink-0 text-garnet-700" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-parchment-900">{item.name}</span>
                      {notProficient && (
                        <>
                          <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0 text-gold-600" />
                          <span className="sr-only">Not proficient</span>
                        </>
                      )}
                    </span>
                    <span className="text-xs uppercase tracking-wide text-parchment-400">{row.label}</span>
                  </div>
                  {grip && <Badge tone="neutral">{grip.short}</Badge>}
                  {item.rarity && item.rarity !== "COMMON" && (
                    <Badge tone={rarityTone(item.rarity)}>{rarityLabel(item.rarity)}</Badge>
                  )}
                  {item.requiresAttunement && (
                    <AttuneToggle
                      item={item}
                      pending={pending}
                      atCap={attunement.atCap}
                      onSubmit={onSubmit}
                    />
                  )}
                  <FilledRowActions
                    row={row}
                    candidates={bagItemsForSlot(inventory, row.slot)}
                    pending={pending}
                    onUnequip={unequip}
                    onReplace={(incoming, outgoing) => void replace(incoming, outgoing, row.slot)}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}

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
