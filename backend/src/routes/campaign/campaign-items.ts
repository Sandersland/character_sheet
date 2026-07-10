import { Router } from "express";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client.js";
import { assertCampaignMembership, assertCampaignOwner } from "@/lib/auth/access.js";
import { parseBodyOr400 } from "@/lib/http/parse-body.js";
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
} from "@/lib/capabilities.js";
import {
  awardCampaignItem,
  CampaignItemAwardError,
  campaignItemHolders,
  revokeCampaignItem,
  type CampaignItemHolder,
} from "@/lib/campaign-item-award.js";
import {
  serializeArmorDetail,
  serializeConsumableDetail,
  serializeWeaponDetail,
} from "@/lib/itemDetail.js";
import { prisma } from "@/lib/core/prisma.js";
import { ITEM_RARITY_KEYS } from "@/lib/srd.js";

// DM-authored campaign items (#380). Owner-only CRUD (list/create/update/delete)
// under /api/campaigns/:id/items; a member-readable by-entity GET feeds the Codex
// item card. Every write auto-manages a fronting ITEM CampaignEntity via
// CampaignItemLink (created HIDDEN, renamed in lockstep, deleted with the item —
// the documented cleanup rule below). dmNotes is DM-private and is scrubbed from
// every player-facing payload (the by-entity GET for a non-owner).

export const campaignItemsRouter = Router();

const CATEGORIES = ["weapon", "armor", "consumable", "gear"] as const;
// The 8 worn EquipSlot values gear may declare; MAIN_HAND/OFF_HAND/BODY are derived from detail data, never authored.
const WORN_SLOTS = ["HEAD", "NECK", "CLOAK", "HANDS", "WRISTS", "BELT", "FEET", "RING"] as const;
const ARMOR_CATEGORIES = ["light", "medium", "heavy", "shield"] as const;
const WEAPON_CLASSES = ["simple", "martial"] as const;
const WEAPON_RANGES = ["melee", "ranged"] as const;

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

// A DM-authored passiveBonus/activatedEffect capability (#545/#546/#543). passiveBonus
// is an always-on modifier (dice nested, consumed at #526C); activatedEffect is a
// toggled self-buff with a recharge (#543), reusing target/op/value for its inline buff.
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
    // activatedEffect payload (#543).
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
        // Name the field in the message too: the route 400s with error.flatten(),
        // which collapses the nested path (capabilities.N.activation) away.
        message: "activation is required when kind is activatedEffect",
      });
    }
    // applyActivate seeds an ADDITIVE buff (modifier: value) and does not honor setTo,
    // so reject a non-add op at the authoring boundary rather than silently misapplying.
    if (val.kind === "activatedEffect" && val.op !== undefined && val.op !== "add") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["op"],
        message: "op must be add when kind is activatedEffect (the buff value is additive)",
      });
    }
  });

// A DM-authored castSpell capability (#528): the item casts a catalog spell from
// its own resource. wielder DC/attack is only meaningful for a spellcaster-
// intended item, so it's rejected unless the item requires spellcaster attunement.
const castSpellInputSchema = z
  .object({
    kind: z.literal("castSpell"),
    spellId: z.string().min(1),
    spellName: z.string().min(1),
    spellLevel: z.number().int().min(0).max(9),
    castLevel: z.number().int().min(0).max(9),
    resource: z.enum(CAST_RESOURCES),
    uses: z.number().int().positive().optional(),
    // Pool charges per cast (#555), meaningful only when resource is "charges".
    chargeCost: z.number().int().positive().optional(),
    concentration: z.boolean().optional(),
    dcMode: z.enum(CAST_STAT_MODES),
    dcValue: z.number().int().optional(),
    attackMode: z.enum(CAST_STAT_MODES),
    attackValue: z.number().int().optional(),
    description: z.string().optional(),
  })
  .strict();

// A DM-authored charges pool (#555): the item's shared charge reservoir that
// castSpell/activatedEffect capabilities with a `charges` resource spend from.
// At most one per item (enforced on the capabilities array below).
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

// A DM-authored grant capability (#529): resistance/immunity/conditionImmunity/
// advantage/proficiency conferred while the item is active. grantValue is the
// damage-type/condition/skill/ability/name; grantOn is advantage-only.
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

// Item-level charges-pool rules (#555): at most ONE pool per item (the spend path
// resolves "the item's pool" implicitly), and a charges-costed castSpell needs a
// pool to spend from. Runs on the capabilities array so create + update share it.
function refineChargesPool(caps: z.infer<typeof capabilityInputSchema>[], ctx: z.RefinementCtx) {
  const pools = caps.filter((c) => c.kind === "charges");
  if (pools.length > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "an item can have at most one charges pool",
    });
  }
  // NOTE: only castSpell is checked — the activatedEffect schema doesn't accept
  // resourceKind "charges" yet (see the enum above). When activatedEffect
  // charges-authoring lands, extend this poolless check to cover it too.
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
  category: z.enum(CATEGORIES),
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

// Nullish default as a call, not a `??` operator — keeps each per-kind column
// builder's field defaulting out of its branch count.
function orElse<T>(value: T | null | undefined, fallback: T): T {
  return value ?? fallback;
}

// The three flat dice columns a passiveBonus/activatedEffect input maps to.
function diceColumns(dice?: { count: number; faces: number; damageType?: string }) {
  return {
    valueDiceCount: orElse(dice?.count, null),
    valueDiceFaces: orElse(dice?.faces, null),
    valueDamageType: orElse(dice?.damageType, null),
  };
}

// Per-kind builders mapping a capability input onto the flat side-table columns.
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

// passiveBonus + activatedEffect share the flat target/op/value + activation columns.
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

// Map a capability input onto the flat side-table columns.
function capabilityCreate(cap: z.infer<typeof capabilityInputSchema>) {
  switch (cap.kind) {
    case "castSpell":
      return castSpellColumns(cap);
    case "charges":
      return chargesColumns(cap);
    case "grant":
      return grantColumns(cap);
    default:
      return passiveColumns(cap);
  }
}

// Reject a wielder-mode castSpell on an item not intended for a spellcaster —
// wielder DC/attack resolves to the holder's spell stats, meaningless otherwise (#528).
function assertWielderModeAllowed(data: {
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

// A worn slot only makes sense on gear (weapons/armor derive their slot from detail data).
// Name the field: the route 400s with error.flatten(), which needs a field key.
function refineSlotCategory(val: { category?: string; slot?: string | null }, ctx: z.RefinementCtx) {
  if (val.slot != null && val.category !== undefined && val.category !== "gear") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["slot"], message: "slot is only valid on a gear item" });
  }
}

const createItemSchema = z.object(baseFields).strict().superRefine(refineSlotCategory);
const updateItemSchema = z.object(baseFields).partial().strict().superRefine(refineSlotCategory);

const awardSchema = z
  .object({
    characterId: z.string().min(1),
    quantity: z.number().int().positive().optional(),
    // Thread the loot event onto a live session (#382); validated in the lib.
    sessionId: z.string().min(1).optional(),
  })
  .strict();
const revokeSchema = z.object({ characterId: z.string().min(1) }).strict();

const itemInclude = {
  weaponDetail: true,
  armorDetail: true,
  consumableDetail: true,
  capabilities: true,
  link: { include: { campaignEntity: { select: { id: true, name: true, visibility: true } } } },
} satisfies Prisma.CampaignItemInclude;

type ItemWithDetails = Prisma.CampaignItemGetPayload<{ include: typeof itemInclude }>;

// Serialize for the wire. dmNotes is included ONLY when includeDmNotes is true —
// the single guard behind "dmNotes never reaches a player-facing payload".
// holders (derived from live InventoryItem rows) is player-safe: just who holds
// how many, so it appears on both the owner list and the revealed Codex card.
function serializeCampaignItem(
  row: ItemWithDetails,
  includeDmNotes: boolean,
  holders: CampaignItemHolder[] = [],
) {
  const entity = row.link?.campaignEntity;
  return {
    holders,
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
    capabilities: row.capabilities.length > 0 ? row.capabilities.map(serializeCapability) : undefined,
    ...(includeDmNotes ? { dmNotes: row.dmNotes ?? undefined } : {}),
    weapon: row.weaponDetail ? serializeWeaponDetail(row.weaponDetail) : undefined,
    armor: row.armorDetail ? serializeArmorDetail(row.armorDetail) : undefined,
    consumable: row.consumableDetail ? serializeConsumableDetail(row.consumableDetail) : undefined,
    entity: entity ? { id: entity.id, name: entity.name, visibility: entity.visibility } : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Build the nested detail-create block matching the item's category.
function detailCreate(data: z.infer<typeof createItemSchema>) {
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

// ── GET /api/campaigns/:id/items ─────────────────────────────────────────────
// Owner-only full list (Manage tab) — includes dmNotes. Players get 403.
campaignItemsRouter.get("/campaigns/:id/items", async (req, res) => {
  await assertCampaignOwner(
    prisma,
    req.user!.id,
    req.params.id,
    "view",
    "Only the campaign owner may manage campaign items",
  );

  const items = await prisma.campaignItem.findMany({
    where: { campaignId: req.params.id },
    include: itemInclude,
    orderBy: { name: "asc" },
  });
  const holders = await campaignItemHolders(items.map((i) => i.id));
  res.json(items.map((row) => serializeCampaignItem(row, true, holders.get(row.id) ?? [])));
});

// ── GET /api/campaigns/:id/items/by-entity/:entityId ─────────────────────────
// Member-readable single item for the Codex card, keyed by the fronting entity.
// Non-owners only see it when that entity is REVEALED, and never see dmNotes.
campaignItemsRouter.get("/campaigns/:id/items/by-entity/:entityId", async (req, res) => {
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "view");
  const isOwner = role === "OWNER";

  const link = await prisma.campaignItemLink.findUnique({
    where: { campaignEntityId: req.params.entityId },
    include: {
      campaignEntity: { select: { campaignId: true, visibility: true } },
      campaignItem: { include: itemInclude },
    },
  });
  // Hidden-from-non-owner, foreign-campaign, or missing all 404 identically.
  if (
    !link ||
    link.campaignEntity.campaignId !== req.params.id ||
    (!isOwner && link.campaignEntity.visibility === "HIDDEN")
  ) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  const holders = await campaignItemHolders([link.campaignItem.id]);
  res.json(serializeCampaignItem(link.campaignItem, isOwner, holders.get(link.campaignItem.id) ?? []));
});

// ── POST /api/campaigns/:id/items ────────────────────────────────────────────
// Owner-only create. Auto-registers a HIDDEN ITEM entity + link in one txn.
campaignItemsRouter.post("/campaigns/:id/items", async (req, res) => {
  await assertCampaignOwner(
    prisma,
    req.user!.id,
    req.params.id,
    "edit",
    "Only the campaign owner may manage campaign items",
  );

  const data = parseBodyOr400(createItemSchema, req.body, res);
  if (data === undefined) return;
  const wielderError = assertWielderModeAllowed(data);
  if (wielderError) {
    res.status(400).json({ error: wielderError });
    return;
  }
  const campaignId = req.params.id;

  const created = await prisma.$transaction(async (tx) => {
    const entity = await tx.campaignEntity.create({
      data: { campaignId, type: "ITEM", name: data.name, visibility: "HIDDEN" },
    });
    return tx.campaignItem.create({
      data: {
        campaignId,
        name: data.name,
        description: data.description ?? null,
        category: data.category,
        slot: data.slot ?? null,
        rarity: data.rarity ?? null,
        requiresAttunement: data.requiresAttunement ?? false,
        attunementPrereqKind: data.attunementPrereqKind ?? null,
        attunementPrereqValue: data.attunementPrereqValue ?? null,
        isUnique: data.isUnique ?? false,
        weight: data.weight ?? null,
        cost: data.cost ?? Prisma.DbNull,
        dmNotes: data.dmNotes ?? null,
        ...detailCreate(data),
        ...(data.capabilities && data.capabilities.length > 0
          ? { capabilities: { create: data.capabilities.map(capabilityCreate) } }
          : {}),
        link: { create: { campaignEntityId: entity.id } },
      },
      include: itemInclude,
    });
  });

  res.status(201).json(serializeCampaignItem(created, true));
});

// ── PATCH /api/campaigns/:id/items/:itemId ───────────────────────────────────
// Owner-only update. A rename is mirrored onto the fronting entity in the txn.
campaignItemsRouter.patch("/campaigns/:id/items/:itemId", async (req, res) => {
  await assertCampaignOwner(
    prisma,
    req.user!.id,
    req.params.id,
    "edit",
    "Only the campaign owner may manage campaign items",
  );

  const data = parseBodyOr400(updateItemSchema, req.body, res);
  if (data === undefined) return;

  const existing = await prisma.campaignItem.findUnique({
    where: { id: req.params.itemId },
    include: { link: true },
  });
  if (!existing || existing.campaignId !== req.params.id) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  // Same wielder-mode guard as the create path (#528). A PATCH may omit
  // attunementPrereqKind while replacing capabilities, so resolve it against the
  // existing row rather than treating an unsent field as "not a spellcaster item".
  const wielderError = assertWielderModeAllowed({
    attunementPrereqKind:
      data.attunementPrereqKind !== undefined ? data.attunementPrereqKind : existing.attunementPrereqKind,
    capabilities: data.capabilities,
  });
  if (wielderError) {
    res.status(400).json({ error: wielderError });
    return;
  }

  // A PATCH may set { slot } without resending category; refineSlotCategory can't see
  // the existing row, so guard slot-on-non-gear against the effective category here —
  // else `{ slot: "NECK" }` on an existing weapon would corrupt paper-doll data on award.
  const effectiveCategory = data.category ?? existing.category;
  if (data.slot != null && effectiveCategory !== "gear") {
    res.status(400).json({
      error: "Invalid request body",
      details: { formErrors: [], fieldErrors: { slot: ["slot is only valid on a gear item"] } },
    });
    return;
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (data.name !== undefined && existing.link) {
      await tx.campaignEntity.update({
        where: { id: existing.link.campaignEntityId },
        data: { name: data.name },
      });
    }
    return tx.campaignItem.update({
      where: { id: existing.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        // Clear a stale slot when the item leaves gear; else persist an explicit slot send.
        ...(data.category !== undefined && data.category !== "gear"
          ? { slot: null }
          : data.slot !== undefined
            ? { slot: data.slot }
            : {}),
        ...(data.rarity !== undefined ? { rarity: data.rarity } : {}),
        ...(data.requiresAttunement !== undefined ? { requiresAttunement: data.requiresAttunement } : {}),
        ...(data.attunementPrereqKind !== undefined ? { attunementPrereqKind: data.attunementPrereqKind } : {}),
        ...(data.attunementPrereqValue !== undefined ? { attunementPrereqValue: data.attunementPrereqValue } : {}),
        ...(data.isUnique !== undefined ? { isUnique: data.isUnique } : {}),
        ...(data.weight !== undefined ? { weight: data.weight } : {}),
        ...(data.cost !== undefined ? { cost: data.cost } : {}),
        ...(data.dmNotes !== undefined ? { dmNotes: data.dmNotes } : {}),
        ...(data.weapon ? { weaponDetail: { upsert: { create: data.weapon, update: data.weapon } } } : {}),
        ...(data.armor ? { armorDetail: { upsert: { create: data.armor, update: data.armor } } } : {}),
        ...(data.consumable
          ? { consumableDetail: { upsert: { create: data.consumable, update: data.consumable } } }
          : {}),
        // Capabilities REPLACE on any send (including []): clear then recreate, so
        // an edit that drops a bonus removes its row rather than merging.
        ...(data.capabilities !== undefined
          ? { capabilities: { deleteMany: {}, create: data.capabilities.map(capabilityCreate) } }
          : {}),
      },
      include: itemInclude,
    });
  });

  res.json(serializeCampaignItem(updated, true));
});

// ── DELETE /api/campaigns/:id/items/:itemId ──────────────────────────────────
// Owner-only. CLEANUP RULE (mirrors the CampaignCharacterLink precedent): the
// fronting ITEM entity has no life without its item, so deleting the item also
// deletes its linked entity in the same transaction (which cascades the link +
// any journal refs). The item delete cascades its detail rows.
campaignItemsRouter.delete("/campaigns/:id/items/:itemId", async (req, res) => {
  await assertCampaignOwner(
    prisma,
    req.user!.id,
    req.params.id,
    "edit",
    "Only the campaign owner may manage campaign items",
  );

  const existing = await prisma.campaignItem.findUnique({
    where: { id: req.params.itemId },
    include: { link: true },
  });
  if (!existing || existing.campaignId !== req.params.id) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.campaignItem.delete({ where: { id: existing.id } });
    if (existing.link) {
      await tx.campaignEntity.delete({ where: { id: existing.link.campaignEntityId } });
    }
  });

  res.status(204).end();
});

// ── POST /api/campaigns/:id/items/:campaignItemId/award ───────────────────────
// Owner-only intent-bearing transaction (#381): snapshots the item into a member
// character's inventory, reveals the fronting entity, and writes an undoable
// audit event on the TARGET character. Unique-item conflicts 409 with the holder.
campaignItemsRouter.post("/campaigns/:id/items/:campaignItemId/award", async (req, res) => {
  await assertCampaignOwner(
    prisma,
    req.user!.id,
    req.params.id,
    "edit",
    "Only the campaign owner may award campaign items",
  );

  const data = parseBodyOr400(awardSchema, req.body, res);
  if (data === undefined) return;

  try {
    await awardCampaignItem({
      campaignId: req.params.id,
      campaignItemId: req.params.campaignItemId,
      characterId: data.characterId,
      quantity: data.quantity ?? 1,
      sessionId: data.sessionId,
    });
  } catch (err) {
    if (err instanceof CampaignItemAwardError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }

  const holders = await campaignItemHolders([req.params.campaignItemId]);
  res.status(200).json({ holders: holders.get(req.params.campaignItemId) ?? [] });
});

// ── POST /api/campaigns/:id/items/:campaignItemId/revoke ──────────────────────
// Owner-only counterpart: removes the provenance-matched inventory row (undoable
// audit event on the target character). A player-modified snapshot is still
// revocable — the match is by campaignItemId, not by field equality.
campaignItemsRouter.post("/campaigns/:id/items/:campaignItemId/revoke", async (req, res) => {
  await assertCampaignOwner(
    prisma,
    req.user!.id,
    req.params.id,
    "edit",
    "Only the campaign owner may revoke campaign items",
  );

  const data = parseBodyOr400(revokeSchema, req.body, res);
  if (data === undefined) return;

  try {
    await revokeCampaignItem({
      campaignId: req.params.id,
      campaignItemId: req.params.campaignItemId,
      characterId: data.characterId,
    });
  } catch (err) {
    if (err instanceof CampaignItemAwardError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }

  const holders = await campaignItemHolders([req.params.campaignItemId]);
  res.status(200).json({ holders: holders.get(req.params.campaignItemId) ?? [] });
});
