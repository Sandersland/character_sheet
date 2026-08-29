import type { Character, WeaponBondOperation } from "@/types/character";

// Bundled into one prop (#1854) rather than four separate bond* props, which
// pushed several components in the InventoryRow chain over fallow's complexity gate.
export interface WeaponBondProps {
  eligible: boolean;
  atCap: boolean;
  pending: boolean;
  onSubmit: (operations: WeaponBondOperation[]) => Promise<void>;
}

// Ineligible, so InventoryRowControls never renders the toggle and the no-op
// onSubmit is never reachable.
export const NULL_WEAPON_BOND_PROPS: WeaponBondProps = {
  eligible: false,
  atCap: false,
  pending: false,
  onSubmit: async () => {},
};

// Eldritch Knight Weapon Bond (PHB'14 p.75, #1854): mirrors the
// summonBondedWeapon action's own server-resolved eligibility rather than
// re-deriving class/level/edition rules client-side.
export function weaponBondEligible(character: Character): boolean {
  return character.availableActions?.some((action) => action.key === "summonBondedWeapon") ?? false;
}

export function bondedWeaponCount(character: Character): number {
  return character.inventory.filter((item) => item.weaponBonded).length;
}
