import { Router } from "express";

import { assertCampaignMembership, assertCampaignOwner } from "@/lib/auth/access.js";
import { parseBodyOr400 } from "@/lib/http/parse-body.js";
import {
  awardCampaignItem,
  CampaignItemAwardError,
  campaignItemHolders,
  revokeCampaignItem,
} from "@/lib/campaign/campaign-item-award.js";
import {
  assertWielderModeAllowed,
  awardSchema,
  capabilityCreate,
  createItemColumns,
  createItemSchema,
  detailCreate,
  detailUpsert,
  itemInclude,
  pickDefined,
  revokeSchema,
  serializeCampaignItem,
  slotUpdate,
  syncLinkedEntityName,
  updateItemSchema,
} from "@/lib/campaign/campaign-items.js";
import { prisma } from "@/lib/core/prisma.js";

// DM-authored campaign items (#380). Owner-only CRUD (list/create/update/delete)
// under /api/campaigns/:id/items; a member-readable by-entity GET feeds the Codex
// item card. Every write auto-manages a fronting ITEM CampaignEntity via
// CampaignItemLink (created HIDDEN, renamed in lockstep, deleted with the item —
// the documented cleanup rule below). dmNotes is DM-private and is scrubbed from
// every player-facing payload (the by-entity GET for a non-owner).

export const campaignItemsRouter = Router();

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
        ...createItemColumns(campaignId, data),
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
    await syncLinkedEntityName(tx, existing, data.name);
    return tx.campaignItem.update({
      where: { id: existing.id },
      data: {
        ...pickDefined(data, [
          "name", "description", "category", "rarity", "requiresAttunement",
          "attunementPrereqKind", "attunementPrereqValue", "isUnique",
          "weight", "cost", "dmNotes",
        ]),
        ...slotUpdate(data),
        ...detailUpsert(data),
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
