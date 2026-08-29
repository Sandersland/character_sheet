// #1648: the ONE place a snapshot is constructed; ends in .parse() so an unrepresentable row fails at the write instead of persisting a blob #1649's readers can't use.
// Capabilities map through readCapability rather than re-reading raw columns, so a malformed row surfaces as an OpaqueCapability that .parse() rejects, instead of being silently dropped.
import { inventorySnapshotSchema, type InventorySnapshot } from "@character-sheet/contracts";
import type { EquipSlot, ItemCategory, ItemRarity } from "@/generated/prisma/client.js";
import type { AttunementPrereqKind, CapabilityColumns } from "./capabilities.js";
import { readCapability } from "./capabilities.js";
import {
  armorDetailFields,
  weaponDetailFields,
  type ArmorDetailFields,
  type ConsumableDetailFields,
  type WeaponDetailFields,
} from "./detail-snapshot.js";
import type { Currency } from "./inventory-currency.js";

// The id here becomes the snapshot's `capabilities[].key` — the same id InventoryCapabilityUse rows address as `capabilityKey`.
export interface SnapshotCapabilityRow extends CapabilityColumns {
  id: string;
}

// Deliberately structural, not tied to a specific Prisma payload type, so a live DB row, a Prisma nested-create input, or an undo snapshot can all supply it without an intermediate re-shape.
export interface SnapshotSourceRow {
  name: string;
  category: ItemCategory;
  weight: number | null;
  cost: Currency | null;
  description: string | null;
  slot: EquipSlot | null;
  rarity: ItemRarity | null;
  requiresAttunement: boolean;
  attunementPrereqKind: AttunementPrereqKind | null;
  attunementPrereqValue: string | null;
  weaponDetail: WeaponDetailFields | null;
  armorDetail: ArmorDetailFields | null;
  consumableDetail: ConsumableDetailFields | null;
  capabilities: SnapshotCapabilityRow[];
}

// campaign-items.ts's currencySchema is partial, so a campaign Item's cost can reach here as e.g. `{gp: 5000}`; snapshotCostSchema is strict, so a missing denomination must become 0 here rather than fail to parse.
function narrowCost(cost: Currency): { cp: number; sp: number; gp: number; pp: number } {
  return { cp: cost.cp ?? 0, sp: cost.sp ?? 0, gp: cost.gp ?? 0, pp: cost.pp ?? 0 };
}

// usesRemaining stays a runtime column (InventoryItem.usesRemaining); dropped here rather than left for the strict schema to reject.
function narrowConsumable(detail: ConsumableDetailFields) {
  return {
    effectDiceCount: detail.effectDiceCount,
    effectDiceFaces: detail.effectDiceFaces,
    effectModifier: detail.effectModifier,
    effectDescription: detail.effectDescription,
    maxUses: detail.maxUses,
  };
}

export function buildInventorySnapshot(row: SnapshotSourceRow): InventorySnapshot {
  const capabilities = row.capabilities.map((c) => ({ key: c.id, ...readCapability(c) }));
  return inventorySnapshotSchema.parse({
    version: 1,
    name: row.name,
    category: row.category,
    weight: row.weight,
    cost: row.cost ? narrowCost(row.cost) : null,
    description: row.description,
    slot: row.slot,
    rarity: row.rarity,
    requiresAttunement: row.requiresAttunement,
    attunementPrereqKind: row.attunementPrereqKind,
    attunementPrereqValue: row.attunementPrereqValue,
    // Re-narrowed through weaponDetailFields/armorDetailFields, not spread directly: a caller may hand a fuller row (e.g. a live DB row carrying id/itemId), and the strict schema below would reject those extra keys at runtime even though TS allows the call.
    weapon: row.weaponDetail ? weaponDetailFields(row.weaponDetail) : null,
    armor: row.armorDetail ? armorDetailFields(row.armorDetail) : null,
    consumable: row.consumableDetail ? narrowConsumable(row.consumableDetail) : null,
    capabilities,
  });
}
