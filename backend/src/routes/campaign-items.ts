import { Router } from "express";
import { z } from "zod";

import { Prisma } from "../generated/prisma/client.js";
import { assertCampaignMembership } from "../lib/auth/access.js";
import {
  awardCampaignItem,
  CampaignItemAwardError,
  campaignItemHolders,
  revokeCampaignItem,
  type CampaignItemHolder,
} from "../lib/campaign-item-award.js";
import {
  serializeArmorDetail,
  serializeConsumableDetail,
  serializeWeaponDetail,
} from "../lib/itemDetail.js";
import { prisma } from "../lib/prisma.js";

// DM-authored campaign items (#380). Owner-only CRUD (list/create/update/delete)
// under /api/campaigns/:id/items; a member-readable by-entity GET feeds the Codex
// item card. Every write auto-manages a fronting ITEM CampaignEntity via
// CampaignItemLink (created HIDDEN, renamed in lockstep, deleted with the item —
// the documented cleanup rule below). dmNotes is DM-private and is scrubbed from
// every player-facing payload (the by-entity GET for a non-owner).

export const campaignItemsRouter = Router();

const CATEGORIES = ["weapon", "armor", "consumable", "gear"] as const;
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

const baseFields = {
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(CATEGORIES),
  rarity: z.string().optional(),
  requiresAttunement: z.boolean().optional(),
  isUnique: z.boolean().optional(),
  weight: z.number().optional(),
  cost: currencySchema.optional(),
  dmNotes: z.string().optional(),
  weapon: weaponInputSchema.optional(),
  armor: armorInputSchema.optional(),
  consumable: consumableInputSchema.optional(),
};

const createItemSchema = z.object(baseFields).strict();
const updateItemSchema = z.object(baseFields).partial().strict();

const awardSchema = z
  .object({ characterId: z.string().min(1), quantity: z.number().int().positive().optional() })
  .strict();
const revokeSchema = z.object({ characterId: z.string().min(1) }).strict();

const itemInclude = {
  weaponDetail: true,
  armorDetail: true,
  consumableDetail: true,
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
    rarity: row.rarity ?? undefined,
    requiresAttunement: row.requiresAttunement,
    isUnique: row.isUnique,
    weight: row.weight ?? undefined,
    cost: row.cost ?? undefined,
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
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "view");
  if (role !== "OWNER") {
    res.status(403).json({ error: "Only the campaign owner may manage campaign items" });
    return;
  }

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
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "edit");
  if (role !== "OWNER") {
    res.status(403).json({ error: "Only the campaign owner may manage campaign items" });
    return;
  }

  const parseResult = createItemSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }
  const data = parseResult.data;
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
        rarity: data.rarity ?? null,
        requiresAttunement: data.requiresAttunement ?? false,
        isUnique: data.isUnique ?? false,
        weight: data.weight ?? null,
        cost: data.cost ?? Prisma.DbNull,
        dmNotes: data.dmNotes ?? null,
        ...detailCreate(data),
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
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "edit");
  if (role !== "OWNER") {
    res.status(403).json({ error: "Only the campaign owner may manage campaign items" });
    return;
  }

  const parseResult = updateItemSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }
  const data = parseResult.data;

  const existing = await prisma.campaignItem.findUnique({
    where: { id: req.params.itemId },
    include: { link: true },
  });
  if (!existing || existing.campaignId !== req.params.id) {
    res.status(404).json({ error: "Item not found" });
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
        ...(data.rarity !== undefined ? { rarity: data.rarity } : {}),
        ...(data.requiresAttunement !== undefined ? { requiresAttunement: data.requiresAttunement } : {}),
        ...(data.isUnique !== undefined ? { isUnique: data.isUnique } : {}),
        ...(data.weight !== undefined ? { weight: data.weight } : {}),
        ...(data.cost !== undefined ? { cost: data.cost } : {}),
        ...(data.dmNotes !== undefined ? { dmNotes: data.dmNotes } : {}),
        ...(data.weapon ? { weaponDetail: { upsert: { create: data.weapon, update: data.weapon } } } : {}),
        ...(data.armor ? { armorDetail: { upsert: { create: data.armor, update: data.armor } } } : {}),
        ...(data.consumable
          ? { consumableDetail: { upsert: { create: data.consumable, update: data.consumable } } }
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
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "edit");
  if (role !== "OWNER") {
    res.status(403).json({ error: "Only the campaign owner may manage campaign items" });
    return;
  }

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
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "edit");
  if (role !== "OWNER") {
    res.status(403).json({ error: "Only the campaign owner may award campaign items" });
    return;
  }

  const parseResult = awardSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  try {
    await awardCampaignItem({
      campaignId: req.params.id,
      campaignItemId: req.params.campaignItemId,
      characterId: parseResult.data.characterId,
      quantity: parseResult.data.quantity ?? 1,
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
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "edit");
  if (role !== "OWNER") {
    res.status(403).json({ error: "Only the campaign owner may revoke campaign items" });
    return;
  }

  const parseResult = revokeSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  try {
    await revokeCampaignItem({
      campaignId: req.params.id,
      campaignItemId: req.params.campaignItemId,
      characterId: parseResult.data.characterId,
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
