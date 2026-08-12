/**
 * Eldritch Knight Weapon Bond endpoint (2014, PHB'14 p.75, #1854) — split out
 * of abilities.ts for the 250-line-per-module ceiling (barrel.test.ts), like
 * disciplines.ts's own module.
 */

import type { BondWeaponOperation, Character, UnbondWeaponOperation } from "@/types/character";
import { applyAbilityTransactions } from "@/api/abilities";

// Bonds an owned weapon InventoryItem — the server enforces the L3+ EK gate
// and the 2-weapon cap (409 past it). Returns the updated Character. Unlike
// attune/unattune (plain InventoryOperation variants dispatched through
// applyInventoryTransactions), bond/unbond route through the shared ability
// endpoint (#1275) — WeaponBondToggle is this function's only caller.
export async function bondWeaponTransaction(characterId: string, inventoryItemId: string): Promise<Character> {
  return applyAbilityTransactions<BondWeaponOperation>(
    characterId,
    "weapon-bond",
    [{ type: "bondWeapon", inventoryItemId }],
    "Failed to bond weapon",
  );
}

// Unbonds a weapon — always legal server-side (mirrors unattune). Returns the
// updated Character.
export async function unbondWeaponTransaction(characterId: string, inventoryItemId: string): Promise<Character> {
  return applyAbilityTransactions<UnbondWeaponOperation>(
    characterId,
    "weapon-bond",
    [{ type: "unbondWeapon", inventoryItemId }],
    "Failed to unbond weapon",
  );
}
