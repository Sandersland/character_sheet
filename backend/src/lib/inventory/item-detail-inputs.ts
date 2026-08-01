// Single source for the weapon/armor/consumable detail-input shapes shared
// by the runtime lib (lib/inventory/inventory.ts) and the catalog seed
// (prisma/seed/catalog-data.ts). Each object is used directly as an Item's
// nested detail create, so a *Detail table's stats are typed in exactly one
// place. Type-only: the seed resolves this module through a plain relative path
// under tsx, and every statement below is erased before that resolution happens.

import type {
  ArmorCategory,
  ArmorDetailInput,
  ItemCategory,
  ToolCategory,
  WeaponDetailInput,
} from "@character-sheet/shared-types";

// The category enums and the weapon/armor inputs are the wire contract and live
// in shared-types (#1273); re-exported so importers keep resolving them here.
export type { ArmorCategory, ArmorDetailInput, ItemCategory, ToolCategory, WeaponDetailInput };

// No frontend twin (the client sends ConsumableDetail, which the API also
// returns), so this one stays backend-local.
export interface ConsumableDetailInput {
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifier?: number;
  effectDescription?: string;
  maxUses?: number;
  usesRemaining?: number;
}
