/**
 * A snapshotted item capability (#1647, epic #1644). The relational form is
 * ~40 nullable columns because SQL cannot hold a discriminated union; JSON can,
 * so this stores the union directly and a `charges` entry with no `maxCharges`
 * becomes unrepresentable instead of reading as an opaque capability.
 *
 * Field names match the backend adapter's five Capability interfaces on
 * purpose, so #1649's mapping is a copy rather than a translation.
 *
 * `key` is the stable identity an InventoryCapabilityUse row addresses — the
 * job the capability row's id does today. `used` is deliberately absent: it is
 * the runtime counter and stays a column.
 */
import { z } from "zod";

import {
  ACTIVATED_DURATIONS,
  ACTIVATION_TYPES,
  ADVANTAGE_ON,
  CAPABILITY_OPS,
  CAPABILITY_TARGETS,
  CAST_RESOURCES,
  CAST_STAT_MODES,
  CHARGE_TRIGGERS,
  GRANT_TYPES,
  GRANT_VALUE_KINDS,
  ITEM_RESOURCE_KINDS,
  ITEM_RESOURCE_PERIODS,
} from "./item-vocabulary.js";

const capabilityKey = z.string().min(1);

const diceSchema = z.strictObject({
  count: z.number().int().positive(),
  faces: z.number().int().positive(),
  damageType: z.string().nullish(),
});

export const snapshotCapabilitySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    key: capabilityKey,
    kind: z.literal("passiveBonus"),
    target: z.enum(CAPABILITY_TARGETS),
    op: z.enum(CAPABILITY_OPS),
    value: z.number().int(),
    targetKey: z.string().nullish(),
    condition: z.string().nullish(),
    dice: diceSchema.nullish(),
    description: z.string().nullish(),
  }),
  z.strictObject({
    key: capabilityKey,
    kind: z.literal("castSpell"),
    spellId: z.string().min(1),
    spellName: z.string().min(1),
    spellLevel: z.number().int().min(0),
    castLevel: z.number().int().min(0),
    resource: z.enum(CAST_RESOURCES),
    uses: z.number().int().nonnegative(),
    concentration: z.boolean(),
    dcMode: z.enum(CAST_STAT_MODES),
    dcValue: z.number().int().nullish(),
    attackMode: z.enum(CAST_STAT_MODES),
    attackValue: z.number().int().nullish(),
    chargeCost: z.number().int().nonnegative(),
    description: z.string().nullish(),
  }),
  z.strictObject({
    key: capabilityKey,
    kind: z.literal("activatedEffect"),
    activation: z.enum(ACTIVATION_TYPES),
    target: z.enum(CAPABILITY_TARGETS),
    op: z.enum(CAPABILITY_OPS),
    value: z.number().int(),
    targetKey: z.string().nullish(),
    duration: z.enum(ACTIVATED_DURATIONS),
    resourceKind: z.enum(ITEM_RESOURCE_KINDS),
    resourcePeriod: z.enum(ITEM_RESOURCE_PERIODS).nullish(),
    resourceCharges: z.number().int().nonnegative(),
    chargeCost: z.number().int().nonnegative(),
    durationText: z.string().nullish(),
    description: z.string().nullish(),
  }),
  z.strictObject({
    key: capabilityKey,
    kind: z.literal("grant"),
    grantType: z.enum(GRANT_TYPES),
    grantOn: z.enum(ADVANTAGE_ON).nullish(),
    grantValueKind: z.enum(GRANT_VALUE_KINDS).nullish(),
    grantValue: z.string().nullish(),
    cantBeSurprised: z.boolean(),
    description: z.string().nullish(),
  }),
  // maxCharges is REQUIRED though the column is nullable: a charges pool with
  // no ceiling is exactly the malformed row readCapability had to tolerate, and
  // rejecting it at the boundary is the reason this is a union at all.
  z.strictObject({
    key: capabilityKey,
    kind: z.literal("charges"),
    maxCharges: z.number().int().positive(),
    rechargeTrigger: z.enum(CHARGE_TRIGGERS),
    rechargeDice: z
      .strictObject({ count: z.number().int().positive(), faces: z.number().int().positive() })
      .nullish(),
    rechargeBonus: z.number().int().nullish(),
    description: z.string().nullish(),
  }),
]);

export type SnapshotCapability = z.infer<typeof snapshotCapabilitySchema>;
