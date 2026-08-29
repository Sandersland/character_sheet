import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client.js";
import { capabilityColumnFields } from "@/lib/inventory/capabilities.js";
import { consumableDetailFields } from "@/lib/inventory/detail-snapshot.js";
import { logEvent } from "@/lib/activity/events.js";
import { snapshotInventoryItemForUndo, inventoryItemDetailInclude, resolveInventoryItem } from "@/lib/inventory/inventory.js";
import { asCurrency } from "@/lib/inventory/inventory-currency.js";
import { buildInventorySnapshot } from "@/lib/inventory/inventory-snapshot-build.js";
import { prisma } from "@/lib/core/prisma.js";
import { getActiveSessionId } from "@/lib/session/sessions.js";

class CampaignItemAwardError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const campaignItemInclude = {
  weaponDetail: true,
  armorDetail: true,
  consumableDetail: true,
  capabilities: true,
  link: { select: { campaignEntityId: true } },
} satisfies Prisma.ItemInclude;

type CampaignItemWithDetails = Prisma.ItemGetPayload<{ include: typeof campaignItemInclude }>;

export interface CampaignItemHolder {
  characterId: string;
  characterName: string;
  quantity: number;
}

function toJsonInput(value: Prisma.JsonValue | null): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

// `used` is not copied: an awarded capability always starts full (remaining = max).
// id is generated client-side so this InventoryCapability row, its InventoryCapabilityUse mirror, and buildInventorySnapshot's capabilities[].key can share one id from a single create() call.
function snapshotCampaignItemCapabilityCreates(item: CampaignItemWithDetails) {
  return item.capabilities.map((c) => ({ id: randomUUID(), ...capabilityColumnFields(c) }));
}

async function resolveAwardSessionId(
  campaignId: string,
  characterId: string,
  requestedSessionId: string | null | undefined,
): Promise<string | null> {
  if (!requestedSessionId) {
    return getActiveSessionId(characterId);
  }
  const session = await prisma.session.findUnique({
    where: { id: requestedSessionId },
    select: { campaignId: true, status: true },
  });
  if (!session || session.campaignId !== campaignId) {
    throw new CampaignItemAwardError(400, "Session does not belong to this campaign");
  }
  if (session.status !== "active") {
    throw new CampaignItemAwardError(400, "Session is not active");
  }
  return requestedSessionId;
}

// findFirst with the full predicate, not findUnique(id) + an in-code campaign check — the latter leaks item existence through timing.
async function loadAwardContext(campaignId: string, campaignItemId: string, characterId: string) {
  const item = await prisma.item.findFirst({
    where: { id: campaignItemId, scope: "CAMPAIGN", campaignId },
    include: campaignItemInclude,
  });
  if (!item) {
    throw new CampaignItemAwardError(404, "Campaign item not found");
  }
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { id: true, name: true, campaignId: true },
  });
  if (!character || character.campaignId !== campaignId) {
    throw new CampaignItemAwardError(400, "Character is not a member of this campaign");
  }
  return { item, character };
}

export async function awardCampaignItem(params: {
  campaignId: string;
  campaignItemId: string;
  characterId: string;
  quantity: number;
  sessionId?: string | null;
}): Promise<void> {
  const { item, character } = await loadAwardContext(
    params.campaignId,
    params.campaignItemId,
    params.characterId,
  );

  const quantity = params.quantity;
  const batchId = randomUUID();
  const sessionId = await resolveAwardSessionId(params.campaignId, character.id, params.sessionId);

  await prisma.$transaction(async (tx) => {
    // Unique-item check happens inside the tx (not before it) so a concurrent award can't slip in between check and write.
    if (item.isUnique) {
      const held = await tx.inventoryItem.findFirst({
        where: { itemId: item.id },
        select: { character: { select: { name: true } } },
      });
      if (held) {
        throw new CampaignItemAwardError(
          409,
          `${item.name} is unique and already held by ${held.character.name}`,
        );
      }
    }

    const position = await tx.inventoryItem.count({ where: { characterId: character.id } });
    const capabilityCreates = snapshotCampaignItemCapabilityCreates(item);
    const capabilityUseCreates = capabilityCreates.map((c) => ({ capabilityKey: c.id, used: 0 }));
    const created = await tx.inventoryItem.create({
      data: {
        characterId: character.id,
        itemId: item.id,
        name: item.name,
        category: item.category,
        weight: item.weight ?? undefined,
        cost: toJsonInput(item.cost),
        description: item.description ?? undefined,
        quantity,
        slot: item.slot,
        rarity: item.rarity,
        // Attunement fields are snapshotted so later attune checks read this frozen copy, not the mutable catalog item.
        requiresAttunement: item.requiresAttunement,
        attunementPrereqKind: item.attunementPrereqKind,
        attunementPrereqValue: item.attunementPrereqValue,
        position,
        // Same consumableDetailFields({ freshCopy: true }) rule as the nested consumableDetail create below: a charged consumable is awarded full.
        usesRemaining: item.consumableDetail
          ? consumableDetailFields(item.consumableDetail, { freshCopy: true }).usesRemaining
          : null,
        snapshot: buildInventorySnapshot({
          name: item.name,
          category: item.category,
          weight: item.weight,
          cost: asCurrency(item.cost),
          description: item.description,
          slot: item.slot,
          rarity: item.rarity,
          requiresAttunement: item.requiresAttunement,
          attunementPrereqKind: item.attunementPrereqKind,
          attunementPrereqValue: item.attunementPrereqValue,
          weaponDetail: item.weaponDetail,
          armorDetail: item.armorDetail,
          consumableDetail: item.consumableDetail,
          capabilities: capabilityCreates,
        }) as unknown as Prisma.InputJsonValue,
        capabilityUses: capabilityUseCreates.length > 0 ? { create: capabilityUseCreates } : undefined,
      },
    });

    if (item.link) {
      // updateMany's WHERE only matches HIDDEN, so revealing an already-revealed entity is a no-op.
      await tx.campaignEntity.updateMany({
        where: { id: item.link.campaignEntityId, visibility: "HIDDEN" },
        data: { visibility: "REVEALED" },
      });
    }

    await logEvent(tx, {
      characterId: character.id,
      category: "inventory",
      type: "awarded",
      summary: `Awarded ${created.name} ×${quantity}`,
      entityType: "InventoryItem",
      entityId: created.id,
      before: null,
      after: { id: created.id, name: created.name, quantity, category: created.category },
      data: {
        itemName: created.name,
        quantityDelta: quantity,
        // itemId (not the legacy campaignItemId key): the audit log is append-only, older events keep the old spelling, and nothing reads this field, so no migration is needed.
        itemId: item.id,
        recipientName: character.name,
      },
      actor: "dm",
      batchId,
      sessionId,
    });
  });
}

export async function revokeCampaignItem(params: {
  campaignId: string;
  campaignItemId: string;
  characterId: string;
}): Promise<void> {
  const { item, character } = await loadAwardContext(
    params.campaignId,
    params.campaignItemId,
    params.characterId,
  );

  const rawRow = await prisma.inventoryItem.findFirst({
    where: { characterId: character.id, itemId: item.id },
    orderBy: { position: "desc" },
    include: inventoryItemDetailInclude,
  });
  if (!rawRow) {
    throw new CampaignItemAwardError(404, `${character.name} does not hold ${item.name}`);
  }
  const row = resolveInventoryItem(rawRow);

  const batchId = randomUUID();
  const sessionId = await getActiveSessionId(character.id);

  await prisma.$transaction(async (tx) => {
    await logEvent(tx, {
      characterId: character.id,
      category: "inventory",
      type: "revoked",
      summary: `Revoked ${row.name}`,
      entityType: "InventoryItem",
      entityId: row.id,
      before: { name: row.name, quantity: row.quantity, category: row.category },
      after: null,
      data: {
        itemName: row.name,
        quantityDelta: -row.quantity,
        recipientName: character.name,
        deletedItem: snapshotInventoryItemForUndo(row),
      },
      actor: "dm",
      batchId,
      sessionId,
    });
    await tx.inventoryItem.delete({ where: { id: row.id } });
  });
}

// itemId matching is safe even though catalog acquisitions also set it: CAMPAIGN-scoped ids and GLOBAL catalog ids never overlap.
export async function campaignItemHolders(
  campaignItemIds: string[],
): Promise<Map<string, CampaignItemHolder[]>> {
  const map = new Map<string, CampaignItemHolder[]>();
  if (campaignItemIds.length === 0) return map;

  const rows = await prisma.inventoryItem.findMany({
    where: { itemId: { in: campaignItemIds } },
    select: {
      itemId: true,
      characterId: true,
      quantity: true,
      character: { select: { name: true } },
    },
  });

  for (const row of rows) {
    // Unreachable (query already filters itemId to non-null ids) — kept because Prisma types the column nullable and narrowing reads better than a non-null assertion.
    if (!row.itemId) continue;
    const list = map.get(row.itemId) ?? [];
    list.push({
      characterId: row.characterId,
      characterName: row.character.name,
      quantity: row.quantity,
    });
    map.set(row.itemId, list);
  }
  return map;
}
