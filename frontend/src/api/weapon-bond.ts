/**
 * Eldritch Knight Weapon Bond (PHB'14 p.75). Split out of abilities.ts for
 * the 250-line-per-module ceiling (barrel.test.ts).
 */

import type { BondWeaponOperation, Character, UnbondWeaponOperation } from "@/types/character";
import { applyAbilityTransactions } from "@/api/abilities";

// The server enforces the L3+ EK gate and the 2-weapon cap (409 past it).
// Unlike attune/unattune (plain InventoryOperation variants dispatched
// through applyInventoryTransactions), bond/unbond route through the
// shared ability endpoint (#1275).
export async function bondWeaponTransaction(characterId: string, inventoryItemId: string): Promise<Character> {
  return applyAbilityTransactions<BondWeaponOperation>(
    characterId,
    "weapon-bond",
    [{ type: "bondWeapon", inventoryItemId }],
    "Failed to bond weapon",
  );
}

// Always legal server-side (mirrors unattune).
export async function unbondWeaponTransaction(characterId: string, inventoryItemId: string): Promise<Character> {
  return applyAbilityTransactions<UnbondWeaponOperation>(
    characterId,
    "weapon-bond",
    [{ type: "unbondWeapon", inventoryItemId }],
    "Failed to unbond weapon",
  );
}
