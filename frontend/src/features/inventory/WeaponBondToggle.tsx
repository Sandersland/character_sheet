import type { InventoryItem, WeaponBondOperation } from "@/types/character";

interface WeaponBondToggleProps {
  item: InventoryItem;
  pending: boolean;
  /** True when 2 weapons are already bonded — blocks bonding a new one (PHB'14 p.75 cap). */
  atCap: boolean;
  onSubmit: (operations: WeaponBondOperation[]) => Promise<void>;
}

// atCap is pre-resolved by the caller from availableActions, the same pattern AttuneToggle uses.
export default function WeaponBondToggle({ item, pending, atCap, onSubmit }: WeaponBondToggleProps) {
  const blocked = !item.weaponBonded && atCap;
  const title = blocked
    ? "At Weapon Bond limit (2/2) — unbond one first"
    : "Eldritch Knight Weapon Bond (PHB'14 p.75) — can't be disarmed, summon as a bonus action";
  return (
    <button
      type="button"
      disabled={pending || blocked}
      aria-pressed={item.weaponBonded}
      title={title}
      onClick={() =>
        onSubmit([
          { type: item.weaponBonded ? "unbondWeapon" : "bondWeapon", inventoryItemId: item.id },
        ])
      }
      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        item.weaponBonded
          ? "border-arcane-300 bg-arcane-50 text-arcane-800 hover:bg-arcane-100"
          : "border-parchment-300 bg-parchment-50 text-parchment-700 hover:bg-parchment-100"
      }`}
    >
      {item.weaponBonded ? "Bonded" : "Bond"}
    </button>
  );
}
