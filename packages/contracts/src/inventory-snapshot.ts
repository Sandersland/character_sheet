/**
 * The frozen half of an InventoryItem, as one JSON document (#1647, epic
 * #1644). Today the same definition data is spread across InventoryItem
 * columns plus three detail tables plus InventoryCapability, and every new
 * field costs two columns and five snapshot call sites. #1648 adds the
 * `snapshot` column this validates; #1649 makes it the only reader.
 *
 * The membership rule is FROZEN DEFINITION DATA ONLY. Runtime state stays in
 * columns because ~15 call sites update it with atomic `updateMany`, and
 * blobbing it would turn each into a read-modify-write: `quantity`,
 * `equippedSlot`, `attuned`, `notes`, `position`, `activatedUsesSpent`,
 * `usesRemaining`, and a capability's `used` are all deliberately absent. A
 * reviewer should be able to confirm that by reading this file alone.
 *
 * Every object is STRICT. zod strips unknown keys by default, so a non-strict
 * schema would accept a blob carrying `quantity` and silently discard it,
 * turning the rule above into a comment nobody enforces.
 */
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

/** Coin purse, the same {cp,sp,gp,pp} shape the cost column has always held. */
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

// `maxUses` is the authored ceiling and is frozen; `usesRemaining` is the
// runtime counter and stays a column. Including both is the single most likely
// mistake in #1648 — the strict object is what catches it.
export const snapshotConsumableSchema = z.strictObject({
  effectDiceCount: z.number().int().positive().nullish(),
  effectDiceFaces: z.number().int().positive().nullish(),
  effectModifier: z.number().int().nullish(),
  effectDescription: z.string().nullish(),
  maxUses: z.number().int().positive().nullish(),
});

export const inventorySnapshotSchema = z.strictObject({
  // Bumped only when a blob shape changes incompatibly, so old rows migrate in
  // code rather than by a data migration.
  version: z.literal(1),

  name: z.string().min(1),
  category: z.enum(ITEM_CATEGORIES),
  weight: z.number().nonnegative().nullish(),
  cost: snapshotCostSchema.nullish(),
  description: z.string().nullish(),
  slot: z.enum(EQUIP_SLOTS).nullish(),

  rarity: z.enum(ITEM_RARITY_KEYS).nullish(),
  requiresAttunement: z.boolean().optional(),
  // null kind = attunable by anyone, distinct from requiresAttunement false.
  attunementPrereqKind: z.enum(ATTUNEMENT_PREREQ_KINDS).nullish(),
  attunementPrereqValue: z.string().nullish(),

  weapon: snapshotWeaponSchema.nullish(),
  armor: snapshotArmorSchema.nullish(),
  consumable: snapshotConsumableSchema.nullish(),

  capabilities: z
    .array(snapshotCapabilitySchema)
    // A z.array cannot express a cross-element rule, so uniqueness is enforced
    // where the array is declared: a duplicate key would make an
    // InventoryCapabilityUse row ambiguous about which capability it counts.
    .refine((caps) => new Set(caps.map((c) => c.key)).size === caps.length, {
      message: "capability keys must be unique within an item",
    }),
});

export type InventorySnapshot = z.infer<typeof inventorySnapshotSchema>;
