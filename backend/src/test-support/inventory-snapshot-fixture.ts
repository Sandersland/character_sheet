// Mirrors buildInventorySnapshot's shape (via the same normalize* defaulting the real custom-item acquire path uses) so a fixture author writes one shape, not two.
import { randomUUID } from "node:crypto";

import type { EquipSlot, ItemCategory, ItemRarity, Prisma } from "@/generated/prisma/client.js";
import type { AttunementPrereqKind, CapabilityColumns } from "@/lib/inventory/capabilities.js";
import { type Currency, toJsonInput } from "@/lib/inventory/inventory-currency.js";
import type { ArmorDetailInput, ConsumableDetailInput, WeaponDetailInput } from "@/lib/inventory/item-detail-inputs.js";
import { buildInventorySnapshot } from "@/lib/inventory/inventory-snapshot-build.js";
import { normalizeArmorDetail, normalizeConsumableDetail, normalizeWeaponDetail } from "@/lib/inventory/inventory-snapshot.js";

export interface InventoryItemFixtureInput {
  characterId: string;
  name: string;
  category: ItemCategory;
  quantity?: number;
  weight?: number | null;
  cost?: Currency | null;
  description?: string | null;
  slot?: EquipSlot | null;
  equippedSlot?: EquipSlot | null;
  rarity?: ItemRarity | null;
  attuned?: boolean;
  requiresAttunement?: boolean;
  attunementPrereqKind?: AttunementPrereqKind | null;
  attunementPrereqValue?: string | null;
  weaponBonded?: boolean;
  notes?: string | null;
  position?: number;
  activatedUsesSpent?: number;
  weapon?: WeaponDetailInput;
  armor?: ArmorDetailInput;
  consumable?: ConsumableDetailInput;
  // `id` is optional — omitted entries are minted a fresh uuid, the same pre-generation pattern awardCampaignItem/recreateDeletedItem use so the same id keys both the snapshot's capabilities[].key and a capabilityUses row.
  capabilities?: (CapabilityColumns & { id?: string; used?: number })[];
}

// Computed once so the snapshot build and the scalar create-data below can't drift onto different capability ids or usesRemaining values.
function resolvedFixtureParts(input: InventoryItemFixtureInput) {
  return {
    weaponDetail: input.weapon ? normalizeWeaponDetail(input.weapon) : null,
    armorDetail: input.armor ? normalizeArmorDetail(input.armor) : null,
    consumableDetail: input.consumable ? normalizeConsumableDetail(input.consumable) : null,
    capabilities: (input.capabilities ?? []).map((c) => ({ used: 0, ...c, id: c.id ?? randomUUID() })),
  };
}

type ResolvedFixtureParts = ReturnType<typeof resolvedFixtureParts>;

function fixtureSnapshot(input: InventoryItemFixtureInput, parts: ResolvedFixtureParts): Prisma.InputJsonValue {
  return buildInventorySnapshot({
    name: input.name,
    category: input.category,
    weight: input.weight ?? null,
    cost: input.cost ?? null,
    description: input.description ?? null,
    slot: input.slot ?? null,
    rarity: input.rarity ?? null,
    requiresAttunement: input.requiresAttunement ?? false,
    attunementPrereqKind: input.attunementPrereqKind ?? null,
    attunementPrereqValue: input.attunementPrereqValue ?? null,
    ...parts,
  }) as unknown as Prisma.InputJsonValue;
}

function fixtureIdentity(input: InventoryItemFixtureInput) {
  return {
    characterId: input.characterId,
    name: input.name,
    category: input.category,
    quantity: input.quantity ?? 1,
    weight: input.weight ?? undefined,
    cost: input.cost !== undefined ? toJsonInput(input.cost) : undefined,
    description: input.description ?? undefined,
    notes: input.notes ?? undefined,
    position: input.position ?? 0,
  };
}

// fallow-ignore-next-line complexity -- nine independent `?? default` column defaults with no shared branching logic; splitting further would just rename the same defaulting, not reduce it
function fixturePlacement(input: InventoryItemFixtureInput, consumableDetail: ResolvedFixtureParts["consumableDetail"]) {
  return {
    slot: input.slot ?? undefined,
    equippedSlot: input.equippedSlot ?? undefined,
    rarity: input.rarity ?? undefined,
    attuned: input.attuned ?? false,
    requiresAttunement: input.requiresAttunement ?? false,
    attunementPrereqKind: input.attunementPrereqKind ?? undefined,
    attunementPrereqValue: input.attunementPrereqValue ?? undefined,
    weaponBonded: input.weaponBonded ?? false,
    activatedUsesSpent: input.activatedUsesSpent ?? undefined,
    usesRemaining: consumableDetail?.usesRemaining ?? null,
  };
}

export function inventoryItemFixtureData(input: InventoryItemFixtureInput): Prisma.InventoryItemUncheckedCreateInput {
  const parts = resolvedFixtureParts(input);
  return {
    ...fixtureIdentity(input),
    ...fixturePlacement(input, parts.consumableDetail),
    snapshot: fixtureSnapshot(input, parts),
    capabilityUses:
      parts.capabilities.length > 0
        ? { create: parts.capabilities.map((c) => ({ capabilityKey: c.id, used: c.used })) }
        : undefined,
  };
}
