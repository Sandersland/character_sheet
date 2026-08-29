/** Frozen definition data only — runtime state (`quantity`, `equippedSlot`, `attuned`, `notes`, `position`, `activatedUsesSpent`, `usesRemaining`, a capability's `used`) stays in columns, updated via atomic `updateMany`, never here. */
/** Every object here is `.strictObject` on purpose — non-strict would silently accept and discard a blob carrying runtime fields, defeating the frozen-data rule above. */
import { z } from "zod";

import { snapshotCapabilitySchema } from "./inventory-snapshot-capability.js";
import {
  ARMOR_CATEGORIES,
  ATTUNEMENT_PREREQ_KINDS,
  EQUIP_SLOTS,
  ITEM_CATEGORIES,
  ITEM_RARITY_KEYS,
  WEAPON_CLASSES,
  WEAPON_RANGES,
} from "./item-vocabulary.js";

export const snapshotCostSchema = z.strictObject({
  cp: z.number().int().nonnegative(),
  sp: z.number().int().nonnegative(),
  gp: z.number().int().nonnegative(),
  pp: z.number().int().nonnegative(),
});

export const snapshotWeaponSchema = z.strictObject({
  damageDiceCount: z.number().int().positive(),
  damageDiceFaces: z.number().int().positive(),
  damageModifier: z.number().int(),
  damageType: z.string().min(1),
  versatileDiceCount: z.number().int().positive().nullish(),
  versatileDiceFaces: z.number().int().positive().nullish(),
  finesse: z.boolean(),
  light: z.boolean(),
  heavy: z.boolean(),
  twoHanded: z.boolean(),
  reach: z.boolean(),
  thrown: z.boolean(),
  ammunition: z.boolean(),
  rangeNormal: z.number().int().positive().nullish(),
  rangeLong: z.number().int().positive().nullish(),
  weaponClass: z.enum(WEAPON_CLASSES).nullish(),
  weaponRange: z.enum(WEAPON_RANGES).nullish(),
});

export const snapshotArmorSchema = z.strictObject({
  armorCategory: z.enum(ARMOR_CATEGORIES),
  baseArmorClass: z.number().int().nonnegative(),
  dexModifierApplies: z.boolean(),
  dexModifierMax: z.number().int().nullish(),
  stealthDisadvantage: z.boolean(),
  strengthRequirement: z.number().int().positive().nullish(),
});

// `maxUses` is the frozen ceiling; `usesRemaining` is the runtime counter and stays a column, not here.
export const snapshotConsumableSchema = z.strictObject({
  effectDiceCount: z.number().int().positive().nullish(),
  effectDiceFaces: z.number().int().positive().nullish(),
  effectModifier: z.number().int().nullish(),
  effectDescription: z.string().nullish(),
  maxUses: z.number().int().positive().nullish(),
});

export const inventorySnapshotSchema = z.strictObject({
  // Bump only when the blob shape changes incompatibly — old rows migrate in code, not via a data migration.
  version: z.literal(1),

  name: z.string().min(1),
  category: z.enum(ITEM_CATEGORIES),
  weight: z.number().nonnegative().nullish(),
  cost: snapshotCostSchema.nullish(),
  description: z.string().nullish(),
  slot: z.enum(EQUIP_SLOTS).nullish(),

  rarity: z.enum(ITEM_RARITY_KEYS).nullish(),
  // `.optional()` not `.nullish()` — the column is `Boolean @default(false)`, never null, so null would misrepresent it.
  requiresAttunement: z.boolean().optional(),
  // null kind = attunable by anyone, distinct from requiresAttunement false.
  attunementPrereqKind: z.enum(ATTUNEMENT_PREREQ_KINDS).nullish(),
  attunementPrereqValue: z.string().nullish(),

  weapon: snapshotWeaponSchema.nullish(),
  armor: snapshotArmorSchema.nullish(),
  consumable: snapshotConsumableSchema.nullish(),

  capabilities: z
    .array(snapshotCapabilitySchema)
    // Enforced here because z.array can't express cross-element uniqueness; a duplicate key would make an InventoryCapabilityUse row ambiguous about which capability it counts.
    .refine((caps) => new Set(caps.map((c) => c.key)).size === caps.length, {
      message: "capability keys must be unique within an item",
    }),
});

export type InventorySnapshot = z.infer<typeof inventorySnapshotSchema>;
