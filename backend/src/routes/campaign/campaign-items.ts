import { Router } from "express";

import { assertCampaignMembership, assertCampaignOwner } from "@/lib/auth/access.js";
import { parseBodyOr400 } from "@/lib/http/parse-body.js";
import {
  awardCampaignItem,
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

export const campaignItemsRouter = Router();

// findFirst with the full predicate, not findUnique(id) + an in-code campaign check — the latter leaks existence through timing (#1646).
function findOwnedCampaignItem(itemId: string, campaignId: string) {
  return prisma.item.findFirst({
    where: { id: itemId, scope: "CAMPAIGN", campaignId },
    include: { link: true },
  });
}

// Includes dmNotes — owner-only.
campaignItemsRouter.get("/campaigns/:id/items", async (req, res) => {
  await assertCampaignOwner(
    prisma,
    req.user!.id,
    req.params.id,
    "view",
    "Only the campaign owner may manage campaign items",
  );

  const items = await prisma.item.findMany({
    where: { scope: "CAMPAIGN", campaignId: req.params.id },
    include: itemInclude,
    orderBy: { name: "asc" },
  });
  const holders = await campaignItemHolders(items.map((i) => i.id));
  res.json(items.map((row) => serializeCampaignItem(row, true, holders.get(row.id) ?? [])));
});

// Non-owners only see this when the fronting entity is REVEALED, and never see dmNotes.
campaignItemsRouter.get("/campaigns/:id/items/by-entity/:entityId", async (req, res) => {
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "view");
  const isOwner = role === "OWNER";

  const link = await prisma.campaignItemLink.findUnique({
    where: { campaignEntityId: req.params.entityId },
    include: {
      campaignEntity: { select: { campaignId: true, visibility: true } },
      item: { include: itemInclude },
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

  const holders = await campaignItemHolders([link.item.id]);
  res.json(serializeCampaignItem(link.item, isOwner, holders.get(link.item.id) ?? []));
});

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
    return tx.item.create({
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

  const existing = await findOwnedCampaignItem(req.params.itemId, req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  // Resolve against the existing row: a PATCH may omit attunementPrereqKind while replacing capabilities (#528).
  const wielderError = assertWielderModeAllowed({
    attunementPrereqKind:
      data.attunementPrereqKind !== undefined ? data.attunementPrereqKind : existing.attunementPrereqKind,
    capabilities: data.capabilities,
  });
  if (wielderError) {
    res.status(400).json({ error: wielderError });
    return;
  }

  // Guard against the effective category, not just data.category: a PATCH may set slot without resending category, and slot on a non-gear item would corrupt paper-doll data on award.
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
    return tx.item.update({
      where: { id: existing.id },
      data: {
        ...pickDefined(data, [
          "name", "description", "category", "rarity", "requiresAttunement",
          "attunementPrereqKind", "attunementPrereqValue", "isUnique",
          "weight", "cost", "dmNotes",
        ]),
        ...slotUpdate(data),
        ...detailUpsert(data),
        // Capabilities REPLACE on any send (including []): clear then recreate, not merge.
        ...(data.capabilities !== undefined
          ? { capabilities: { deleteMany: {}, create: data.capabilities.map(capabilityCreate) } }
          : {}),
      },
      include: itemInclude,
    });
  });

  res.json(serializeCampaignItem(updated, true));
});

// The fronting ITEM entity has no life without its item — deleted in the same transaction, cascading its link and any journal refs.
campaignItemsRouter.delete("/campaigns/:id/items/:itemId", async (req, res) => {
  await assertCampaignOwner(
    prisma,
    req.user!.id,
    req.params.id,
    "edit",
    "Only the campaign owner may manage campaign items",
  );

  const existing = await findOwnedCampaignItem(req.params.itemId, req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.item.delete({ where: { id: existing.id } });
    if (existing.link) {
      await tx.campaignEntity.delete({ where: { id: existing.link.campaignEntityId } });
    }
  });

  res.status(204).end();
});

// A unique-item conflict 409s with the current holder.
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

  // CampaignItemAwardError carries its own status, so it flows to the central errorHandler.
  await awardCampaignItem({
    campaignId: req.params.id,
    campaignItemId: req.params.campaignItemId,
    characterId: data.characterId,
    quantity: data.quantity ?? 1,
    sessionId: data.sessionId,
  });

  const holders = await campaignItemHolders([req.params.campaignItemId]);
  res.status(200).json({ holders: holders.get(req.params.campaignItemId) ?? [] });
});

// A player-modified snapshot is still revocable — matched by item id, not field equality.
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

  // CampaignItemAwardError carries its own status, so it flows to the central errorHandler.
  await revokeCampaignItem({
    campaignId: req.params.id,
    campaignItemId: req.params.campaignItemId,
    characterId: data.characterId,
  });

  const holders = await campaignItemHolders([req.params.campaignItemId]);
  res.status(200).json({ holders: holders.get(req.params.campaignItemId) ?? [] });
});
