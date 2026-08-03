// The ONE place a snapshot is constructed (#1648, epic #1644). Every creation
// path (Task 4) and the one-shot backfill (Task 3) call this, and it ends in
// .parse() so a row that cannot be represented fails at the write instead of
// persisting a blob #1649's readers cannot use.
//
// Capabilities map through readCapability rather than re-reading the raw
// columns: that adapter already produces the five shapes
// snapshotCapabilitySchema mirrors, and a second mapping would be a mirror to
// keep in step — the exact tax this epic removes. readCapability returns an
// OpaqueCapability for a malformed row, which .parse() then rejects; that is
// intended — an unrepresentable capability must surface here, loudly, not be
// silently dropped.
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

// A capability row plus the id buildInventorySnapshot keys it by in the
// snapshot's `capabilities[].key` — the same id InventoryCapabilityUse rows
// address as `capabilityKey`.
export interface SnapshotCapabilityRow extends CapabilityColumns {
  id: string;
}

// The frozen-field shape buildInventorySnapshot reads from. Deliberately
// structural (not tied to a specific Prisma payload type) so every creation
// site — a live DB row, a Prisma nested-create input, or an undo snapshot —
// can supply it without an intermediate re-shape.
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

// consumableDetail's maxUses is frozen; usesRemaining is the runtime counter
// and stays a column (InventoryItem.usesRemaining) — dropped here rather than
// left for the strict schema to reject, so a caller sees the parse succeed on
// everything else and only fail where it actually matters.
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
    cost: row.cost,
    description: row.description,
    slot: row.slot,
    rarity: row.rarity,
    requiresAttunement: row.requiresAttunement,
    attunementPrereqKind: row.attunementPrereqKind,
    attunementPrereqValue: row.attunementPrereqValue,
    // Re-narrowed through weaponDetailFields/armorDetailFields (not spread
    // directly): a caller may hand this a fuller row (e.g. a live DB row
    // carrying id/itemId) that's merely structurally compatible with
    // WeaponDetailFields/ArmorDetailFields — the strict schema below would
    // reject those extra keys at runtime even though TS allows the call.
    weapon: row.weaponDetail ? weaponDetailFields(row.weaponDetail) : null,
    armor: row.armorDetail ? armorDetailFields(row.armorDetail) : null,
    consumable: row.consumableDetail ? narrowConsumable(row.consumableDetail) : null,
    capabilities,
  });
}
