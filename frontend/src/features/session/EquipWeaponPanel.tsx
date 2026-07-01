// Inline "Equip a weapon" list — owned-but-unequipped weapons the player can arm without leaving the attack flow.

import type { InventoryItem } from "@/types/character";

interface EquipWeaponPanelProps {
  weapons: InventoryItem[];
  equipping: string | null;
  onEquip: (inventoryItemId: string) => void;
}

export default function EquipWeaponPanel({ weapons, equipping, onEquip }: EquipWeaponPanelProps) {
  if (weapons.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
        Equip a weapon
      </p>
      {weapons.map((item) => (
        <div key={item.id} className="flex items-center justify-between">
          <p className="text-sm text-parchment-700">{item.name}</p>
          <button
            type="button"
            disabled={equipping !== null}
            onClick={() => onEquip(item.id)}
            className="rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {equipping === item.id ? "Equipping…" : "Equip"}
          </button>
        </div>
      ))}
    </div>
  );
}
