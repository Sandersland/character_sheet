import type { Character, WeaponBondOperation } from "@/types/character";

/**
 * The Weapon Bond toggle's four related props, bundled into one object
 * (#1854) rather than threaded as four separate props through InventoryList
 * → InventoryBody → InventoryContent → InventorySections → InventoryRow (and
 * the ItemDetailSheet/ItemDetailActions/ItemDetailControls mobile twin) —
 * four discrete `bond*` props at every layer of that chain pushed several of
 * those components' prop counts/cognitive score over the fallow complexity
 * gate. One `bond: WeaponBondProps` prop mirrors how `onSubmit`/`pending`
 * already travel that same chain for the generic inventory ops.
 */
export interface WeaponBondProps {
  eligible: boolean;
  atCap: boolean;
  pending: boolean;
  onSubmit: (operations: WeaponBondOperation[]) => Promise<void>;
}

/** Default for a caller that never touches Weapon Bond (most InventoryRow
 *  callers/tests) — ineligible, so InventoryRowControls never renders the
 *  toggle and the no-op onSubmit is never reachable. */
export const NULL_WEAPON_BOND_PROPS: WeaponBondProps = {
  eligible: false,
  atCap: false,
  pending: false,
  onSubmit: async () => {},
};

/**
 * Eldritch Knight Weapon Bond (2014, PHB'14 p.75, #1854): whether this
 * character can bond a weapon at all. Reads the SAME server-resolved signal
 * the "Summon Bonded Weapon" bonus action's own gate uses — the
 * summonBondedWeapon DERIVED_ACTIONS row only appears in `availableActions`
 * for an eligible entry (fighter L3+, fighter-eldritch-knight, 2014) — rather
 * than re-deriving class/level/edition eligibility client-side (CLAUDE.md:
 * "the frontend never originates a rule").
 */
export function weaponBondEligible(character: Character): boolean {
  return character.availableActions?.some((action) => action.key === "summonBondedWeapon") ?? false;
}

/** Count of currently-bonded weapons — just counting served flags, same shape
 *  as InventoryList's own `attunedCount`. */
export function bondedWeaponCount(character: Character): number {
  return character.inventory.filter((item) => item.weaponBonded).length;
}
