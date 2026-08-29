// Type-only: the seed resolves this module through a plain relative path under tsx, and every statement below is erased before that resolution happens.

import type {
  ArmorCategory,
  ArmorDetailInput,
  ItemCategory,
  ToolCategory,
  WeaponDetailInput,
} from "@character-sheet/shared-types";

// #1273: these live in shared-types as the wire contract; re-exported so importers keep resolving them here.
export type { ArmorCategory, ArmorDetailInput, ItemCategory, ToolCategory, WeaponDetailInput };

// No frontend twin — the client sends/receives ConsumableDetail directly — so this stays backend-local.
export interface ConsumableDetailInput {
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifier?: number;
  effectDescription?: string;
  maxUses?: number;
  usesRemaining?: number;
}
