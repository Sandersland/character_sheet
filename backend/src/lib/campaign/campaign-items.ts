import { z } from "zod";

import { ARMOR_CATEGORIES, ITEM_CATEGORIES, WEAPON_CLASSES, WEAPON_RANGES } from "@character-sheet/contracts";

import { Prisma } from "@/generated/prisma/client.js";
import {
  ADVANTAGE_ON,
  ATTUNEMENT_PREREQ_KINDS,
  CAPABILITY_OPS,
  CAPABILITY_TARGETS,
  CAST_RESOURCES,
  CAST_STAT_MODES,
  CHARGE_TRIGGERS,
  GRANT_TYPES,
  GRANT_VALUE_KINDS,
  serializeCapability,
} from "@/lib/inventory/capabilities.js";
import {
  serializeArmorDetail,
  serializeConsumableDetail,
  serializeWeaponDetail,
} from "@/lib/inventory/itemDetail.js";
import { ITEM_RARITY_KEYS } from "@/lib/srd/srd.js";

import type { CampaignItemHolder } from "./campaign-item-award.js";

// WORN_SLOTS is a deliberate subset of EQUIP_SLOTS (MAIN_HAND/OFF_HAND/BODY are derived, never authored) — not a mirror, which is why it stays local instead of coming from contracts.
const WORN_SLOTS = ["HEAD", "NECK", "CLOAK", "HANDS", "WRISTS", "BELT", "FEET", "RING"] as const;

const currencySchema = z
  .object({ cp: z.number().int(), sp: z.number().int(), gp: z.number().int(), pp: z.number().int() })
  .partial()
  .strict();

const weaponInputSchema = z
  .object({
    damageDiceCount: z.number().int(),
    damageDiceFaces: z.number().int(),
    damageModifier: z.number().int().optional(),
    damageType: z.string().min(1),
    versatileDiceCount: z.number().int().optional(),
    versatileDiceFaces: z.number().int().optional(),
    finesse: z.boolean().optional(),
    light: z.boolean().optional(),
    heavy: z.boolean().optional(),
    twoHanded: z.boolean().optional(),
    reach: z.boolean().optional(),
    thrown: z.boolean().optional(),
    ammunition: z.boolean().optional(),
    rangeNormal: z.number().int().optional(),
    rangeLong: z.number().int().optional(),
    weaponClass: z.enum(WEAPON_CLASSES).optional(),
    weaponRange: z.enum(WEAPON_RANGES).optional(),
  })
  .strict();

const armorInputSchema = z
  .object({
    armorCategory: z.enum(ARMOR_CATEGORIES),
    baseArmorClass: z.number().int(),
    dexModifierApplies: z.boolean().optional(),
    dexModifierMax: z.number().int().optional(),
    stealthDisadvantage: z.boolean().optional(),
    strengthRequirement: z.number().int().optional(),
  })
  .strict();

const consumableInputSchema = z
  .object({
    effectDiceCount: z.number().int().optional(),
    effectDiceFaces: z.number().int().optional(),
    effectModifier: z.number().int().optional(),
    effectDescription: z.string().optional(),
  })
  .strict();

// activatedEffect reuses passiveBonus's target/op/value fields for its own buff instead of separate columns.
const passiveBonusInputSchema = z
  .object({
    kind: z.enum(["passiveBonus", "activatedEffect"]),
    target: z.enum(CAPABILITY_TARGETS),
    op: z.enum(CAPABILITY_OPS),
    value: z.number().int().optional(),
    targetKey: z.string().min(1).optional(),
    condition: z.string().optional(),
    description: z.string().optional(),
    dice: z
      .object({
        count: z.number().int().positive(),
        faces: z.number().int().positive(),
        damageType: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    activation: z.enum(["action", "bonus", "reaction", "commandWord"]).optional(),
    activatedDuration: z.enum(["whileActive", "untilRest"]).optional(),
    resourceKind: z.enum(["perRest", "perDay", "atWill"]).optional(),
    resourcePeriod: z.enum(["short", "long", "dawn", "dusk"]).optional(),
    resourceCharges: z.number().int().positive().optional(),
    durationText: z.string().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.kind === "activatedEffect" && val.activation === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["activation"],
        // Name the field in the message too: the route 400s with error.flatten(), which drops the nested path.
        message: "activation is required when kind is activatedEffect",
      });
    }
    // applyActivate only supports an additive buff (ignores setTo), so reject a non-add op here rather than silently misapplying it.
    if (val.kind === "activatedEffect" && val.op !== undefined && val.op !== "add") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["op"],
        message: "op must be add when kind is activatedEffect (the buff value is additive)",
      });
    }
  });

const castSpellInputSchema = z
  .object({
    kind: z.literal("castSpell"),
    spellId: z.string().min(1),
    spellName: z.string().min(1),
    spellLevel: z.number().int().min(0).max(9),
    castLevel: z.number().int().min(0).max(9),
    resource: z.enum(CAST_RESOURCES),
    uses: z.number().int().positive().optional(),
    chargeCost: z.number().int().positive().optional(),
    concentration: z.boolean().optional(),
    dcMode: z.enum(CAST_STAT_MODES),
    dcValue: z.number().int().optional(),
    attackMode: z.enum(CAST_STAT_MODES),
    attackValue: z.number().int().optional(),
    description: z.string().optional(),
  })
  .strict();

const chargesInputSchema = z
  .object({
    kind: z.literal("charges"),
    maxCharges: z.number().int().positive(),
    recharge: z
      .object({
        trigger: z.enum(CHARGE_TRIGGERS),
        dice: z.object({ count: z.number().int().positive(), faces: z.number().int().positive() }).strict().optional(),
        bonus: z.number().int().positive().optional(),
      })
      .strict(),
    description: z.string().optional(),
  })
  .strict();

const grantInputSchema = z
  .object({
    kind: z.literal("grant"),
    grantType: z.enum(GRANT_TYPES),
    grantOn: z.enum(ADVANTAGE_ON).optional(),
    grantValueKind: z.enum(GRANT_VALUE_KINDS).optional(),
    grantValue: z.string().min(1).optional(),
    cantBeSurprised: z.boolean().optional(),
    description: z.string().optional(),
  })
  .strict();

const capabilityInputSchema = z.discriminatedUnion("kind", [
  passiveBonusInputSchema,
  castSpellInputSchema,
  grantInputSchema,
  chargesInputSchema,
]);

// At most one charges pool per item: the spend path elsewhere resolves "the item's pool" implicitly, assuming there's only one.
function refineChargesPool(caps: z.infer<typeof capabilityInputSchema>[], ctx: z.RefinementCtx) {
  const pools = caps.filter((c) => c.kind === "charges");
  if (pools.length > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "an item can have at most one charges pool",
    });
  }
  // Only castSpell is checked here — activatedEffect's schema doesn't accept resourceKind "charges" yet; extend this when it does.
  if (pools.length === 0 && caps.some((c) => c.kind === "castSpell" && c.resource === "charges")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "a castSpell capability that spends charges requires a charges pool on the same item",
    });
  }
}

const baseFields = {
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(ITEM_CATEGORIES),
  slot: z.enum(WORN_SLOTS).nullable().optional(),
  rarity: z.enum(ITEM_RARITY_KEYS).nullable().optional(),
  requiresAttunement: z.boolean().optional(),
  attunementPrereqKind: z.enum(ATTUNEMENT_PREREQ_KINDS).nullable().optional(),
  attunementPrereqValue: z.string().nullable().optional(),
  isUnique: z.boolean().optional(),
  weight: z.number().optional(),
  cost: currencySchema.optional(),
  dmNotes: z.string().optional(),
  weapon: weaponInputSchema.optional(),
  armor: armorInputSchema.optional(),
  consumable: consumableInputSchema.optional(),
  capabilities: z.array(capabilityInputSchema).superRefine(refineChargesPool).optional(),
};

// A function call instead of inline `??` keeps each per-kind column builder's branch count down.
function orElse<T>(value: T | null | undefined, fallback: T): T {
  return value ?? fallback;
}

function diceColumns(dice?: { count: number; faces: number; damageType?: string }) {
  return {
    valueDiceCount: orElse(dice?.count, null),
    valueDiceFaces: orElse(dice?.faces, null),
    valueDamageType: orElse(dice?.damageType, null),
  };
}

function castSpellColumns(cap: z.infer<typeof castSpellInputSchema>) {
  return {
    kind: cap.kind,
    description: orElse(cap.description, null),
    spellId: cap.spellId,
    spellName: cap.spellName,
    spellLevel: cap.spellLevel,
    castLevel: cap.castLevel,
    castResource: cap.resource,
    castUses: orElse(cap.uses, 1),
    castConcentration: orElse(cap.concentration, false),
    dcMode: cap.dcMode,
    dcValue: orElse(cap.dcValue, null),
    attackMode: cap.attackMode,
    attackValue: orElse(cap.attackValue, null),
    chargeCost: cap.resource === "charges" ? orElse(cap.chargeCost, 1) : null,
  };
}

function chargesColumns(cap: z.infer<typeof chargesInputSchema>) {
  return {
    kind: cap.kind,
    description: orElse(cap.description, null),
    maxCharges: cap.maxCharges,
    rechargeTrigger: cap.recharge.trigger,
    rechargeDiceCount: orElse(cap.recharge.dice?.count, null),
    rechargeDiceFaces: orElse(cap.recharge.dice?.faces, null),
    rechargeBonus: orElse(cap.recharge.bonus, null),
  };
}

function grantColumns(cap: z.infer<typeof grantInputSchema>) {
  return {
    kind: cap.kind,
    description: orElse(cap.description, null),
    grantType: cap.grantType,
    grantOn: orElse(cap.grantOn, null),
    grantValueKind: orElse(cap.grantValueKind, null),
    grantValue: orElse(cap.grantValue, null),
    cantBeSurprised: orElse(cap.cantBeSurprised, false),
  };
}

function passiveColumns(cap: z.infer<typeof passiveBonusInputSchema>) {
  return {
    kind: cap.kind,
    target: cap.target,
    op: cap.op,
    value: orElse(cap.value, null),
    targetKey: orElse(cap.targetKey, null),
    condition: orElse(cap.condition, null),
    description: orElse(cap.description, null),
    ...diceColumns(cap.dice),
    activation: orElse(cap.activation, null),
    activatedDuration: orElse(cap.activatedDuration, null),
    resourceKind: orElse(cap.resourceKind, null),
    resourcePeriod: orElse(cap.resourcePeriod, null),
    resourceCharges: orElse(cap.resourceCharges, null),
    durationText: orElse(cap.durationText, null),
  };
}

export function capabilityCreate(cap: z.infer<typeof capabilityInputSchema>) {
  switch (cap.kind) {
    case "castSpell":
      return castSpellColumns(cap);
    case "charges":
      return chargesColumns(cap);
    case "grant":
      return grantColumns(cap);
    case "passiveBonus":
    case "activatedEffect":
      return passiveColumns(cap);
  }
}

// wielder DC/attack resolves to the holder's own spell stats, which is meaningless unless the item requires spellcaster attunement.
export function assertWielderModeAllowed(data: {
  attunementPrereqKind?: string | null;
  capabilities?: z.infer<typeof capabilityInputSchema>[];
}): string | null {
  const wantsWielder = (data.capabilities ?? []).some(
    (c) => c.kind === "castSpell" && (c.dcMode === "wielder" || c.attackMode === "wielder"),
  );
  if (wantsWielder && data.attunementPrereqKind !== "spellcaster") {
    return "wielder DC/attack requires the item to be attunable by a spellcaster; use fixed values otherwise";
  }
  return null;
}

// weapons/armor derive their own slot from detail data, so an authored slot only makes sense on gear.
function refineSlotCategory(val: { category?: string; slot?: string | null }, ctx: z.RefinementCtx) {
  if (val.slot != null && val.category !== undefined && val.category !== "gear") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["slot"], message: "slot is only valid on a gear item" });
  }
}

export const createItemSchema = z.object(baseFields).strict().superRefine(refineSlotCategory);
export const updateItemSchema = z.object(baseFields).partial().strict().superRefine(refineSlotCategory);

export const awardSchema = z
  .object({
    characterId: z.string().min(1),
    quantity: z.number().int().positive().optional(),
    sessionId: z.string().min(1).optional(),
  })
  .strict();
export const revokeSchema = z.object({ characterId: z.string().min(1) }).strict();

export const itemInclude = {
  weaponDetail: true,
  armorDetail: true,
  consumableDetail: true,
  capabilities: true,
  link: { include: { campaignEntity: { select: { id: true, name: true, visibility: true } } } },
} satisfies Prisma.ItemInclude;

type ItemWithDetails = Prisma.ItemGetPayload<{ include: typeof itemInclude }>;

// null → undefined so unset scalar fields vanish from the wire instead of serializing as null.
function serializeItemBase(row: ItemWithDetails) {
  return {
    id: row.id,
    campaignId: row.campaignId,
    name: row.name,
    description: row.description ?? undefined,
    category: row.category,
    slot: row.slot ?? undefined,
    rarity: row.rarity ?? undefined,
    requiresAttunement: row.requiresAttunement,
    attunementPrereqKind: row.attunementPrereqKind ?? undefined,
    attunementPrereqValue: row.attunementPrereqValue ?? undefined,
    isUnique: row.isUnique,
    weight: row.weight ?? undefined,
    cost: row.cost ?? undefined,
  };
}

// At most one detail block is present, keyed by category.
function serializeItemDetails(row: ItemWithDetails) {
  return {
    weapon: row.weaponDetail ? serializeWeaponDetail(row.weaponDetail) : undefined,
    armor: row.armorDetail ? serializeArmorDetail(row.armorDetail) : undefined,
    consumable: row.consumableDetail ? serializeConsumableDetail(row.consumableDetail) : undefined,
  };
}

// includeDmNotes is the ONLY guard against dmNotes reaching a player payload — the table itself no longer makes it private.
export function serializeCampaignItem(
  row: ItemWithDetails,
  includeDmNotes: boolean,
  holders: CampaignItemHolder[] = [],
) {
  const entity = row.link?.campaignEntity;
  return {
    holders,
    ...serializeItemBase(row),
    capabilities: row.capabilities.length > 0 ? row.capabilities.map(serializeCapability) : undefined,
    ...(includeDmNotes ? { dmNotes: row.dmNotes ?? undefined } : {}),
    ...serializeItemDetails(row),
    entity: entity ? { id: entity.id, name: entity.name, visibility: entity.visibility } : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function detailCreate(data: z.infer<typeof createItemSchema>) {
  if (data.category === "weapon" && data.weapon) {
    return { weaponDetail: { create: data.weapon } };
  }
  if (data.category === "armor" && data.armor) {
    return { armorDetail: { create: data.armor } };
  }
  if (data.category === "consumable" && data.consumable) {
    return { consumableDetail: { create: data.consumable } };
  }
  return {};
}

export function createItemColumns(campaignId: string, data: z.infer<typeof createItemSchema>) {
  return {
    campaignId,
    // scope/scopeKey are written together: Item_scope_key_agreement_check rejects a row where they disagree.
    scope: "CAMPAIGN" as const,
    scopeKey: `campaign:${campaignId}`,
    name: data.name,
    description: orElse(data.description, null),
    category: data.category,
    slot: orElse(data.slot, null),
    rarity: orElse(data.rarity, null),
    requiresAttunement: orElse(data.requiresAttunement, false),
    attunementPrereqKind: orElse(data.attunementPrereqKind, null),
    attunementPrereqValue: orElse(data.attunementPrereqValue, null),
    isUnique: orElse(data.isUnique, false),
    weight: orElse(data.weight, null),
    cost: orElse<z.infer<typeof createItemSchema>["cost"] | typeof Prisma.DbNull>(data.cost, Prisma.DbNull),
    dmNotes: orElse(data.dmNotes, null),
  };
}

// A key must stay ABSENT (not present as undefined) from the Prisma update input, or the column gets touched.
export function pickDefined<T extends object, K extends keyof T>(data: T, keys: K[]): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    if (data[key] !== undefined) out[key] = data[key];
  }
  return out;
}

export function slotUpdate(data: z.infer<typeof updateItemSchema>) {
  if (data.category !== undefined && data.category !== "gear") return { slot: null };
  if (data.slot !== undefined) return { slot: data.slot };
  return {};
}

// upsert, not update: a detail block may be patched onto an item that was created without one.
export function detailUpsert(data: z.infer<typeof updateItemSchema>) {
  return {
    ...(data.weapon !== undefined ? { weaponDetail: { upsert: { create: data.weapon, update: data.weapon } } } : {}),
    ...(data.armor !== undefined ? { armorDetail: { upsert: { create: data.armor, update: data.armor } } } : {}),
    ...(data.consumable !== undefined
      ? { consumableDetail: { upsert: { create: data.consumable, update: data.consumable } } }
      : {}),
  };
}

// A rename is mirrored onto the fronting entity so the Codex stays consistent.
export async function syncLinkedEntityName(
  tx: Prisma.TransactionClient,
  existing: { link: { campaignEntityId: string } | null },
  name: string | undefined,
): Promise<void> {
  if (name === undefined || !existing.link) return;
  await tx.campaignEntity.update({
    where: { id: existing.link.campaignEntityId },
    data: { name },
  });
}
