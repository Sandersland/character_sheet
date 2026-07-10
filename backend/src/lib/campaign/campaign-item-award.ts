import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client.js";
import { snapshotDetailCreate } from "@/lib/inventory/detail-snapshot.js";
import { logEvent } from "@/lib/activity/events.js";
import { snapshotInventoryItemForUndo, inventoryItemDetailInclude } from "@/lib/inventory/inventory.js";
import { prisma } from "@/lib/core/prisma.js";
import { getActiveSessionId } from "@/lib/session/sessions.js";

// DM item award/revoke (#381). A campaign owner grants a DM-authored
// CampaignItem into a member character's inventory: the mechanical fields +
// matching detail row are snapshotted into a new InventoryItem tagged with a
// campaignItemId provenance FK, the fronting entity is revealed, and an audit
// event is written on the TARGET character so the grant is LIFO-undoable via
// the shared inventory revert (category "inventory", shape-driven).

export class CampaignItemAwardError extends Error {
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
} satisfies Prisma.CampaignItemInclude;

type CampaignItemWithDetails = Prisma.CampaignItemGetPayload<{ include: typeof campaignItemInclude }>;

export interface CampaignItemHolder {
  characterId: string;
  characterName: string;
  quantity: number;
}

function toJsonInput(value: Prisma.JsonValue | null): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

// Builds the InventoryItem nested detail-create block from a CampaignItem's
// already-included detail rows — the CampaignItem*Detail tables share the exact
// shape of the Inventory*Detail tables, so this is a straight field copy.
function snapshotCampaignItemDetail(item: CampaignItemWithDetails) {
  return {
    ...snapshotDetailCreate(item),
    // Typed capability rows snapshotted 1:1 onto the awarded item (#545) — a
    // straight column copy, same as the detail tables above. The snapshot is
    // self-contained, so a later edit/revoke of the source leaves these intact.
    capabilities:
      item.capabilities.length > 0
        ? {
            create: item.capabilities.map((c) => ({
              kind: c.kind,
              description: c.description,
              target: c.target,
              op: c.op,
              value: c.value,
              targetKey: c.targetKey,
              condition: c.condition,
              valueDiceCount: c.valueDiceCount,
              valueDiceFaces: c.valueDiceFaces,
              valueDamageType: c.valueDamageType,
              // castSpell columns (#528) — provenance spellId + authored config.
              // `used` is NOT copied (runtime state resets to 0 on the new item).
              spellId: c.spellId,
              spellName: c.spellName,
              spellLevel: c.spellLevel,
              castLevel: c.castLevel,
              castResource: c.castResource,
              castUses: c.castUses,
              castConcentration: c.castConcentration,
              dcMode: c.dcMode,
              dcValue: c.dcValue,
              attackMode: c.attackMode,
              attackValue: c.attackValue,
              // activatedEffect columns (#543).
              activation: c.activation,
              activatedDuration: c.activatedDuration,
              resourceKind: c.resourceKind,
              resourcePeriod: c.resourcePeriod,
              resourceCharges: c.resourceCharges,
              durationText: c.durationText,
              // grant columns (#529).
              grantType: c.grantType,
              grantOn: c.grantOn,
              grantValueKind: c.grantValueKind,
              grantValue: c.grantValue,
              cantBeSurprised: c.cantBeSurprised,
              // charges pool columns (#555). `used` stays uncopied — an awarded
              // pool starts full (remaining = maxCharges − 0).
              maxCharges: c.maxCharges,
              rechargeDiceCount: c.rechargeDiceCount,
              rechargeDiceFaces: c.rechargeDiceFaces,
              rechargeBonus: c.rechargeBonus,
              rechargeTrigger: c.rechargeTrigger,
              chargeCost: c.chargeCost,
            })),
          }
        : undefined,
  };
}

// Resolves the sessionId a loot event threads onto (#382). With no explicit
// request, keeps #381 behaviour: auto-thread the campaign's active session (null
// out of session). An explicit id must belong to this campaign (else 400) and be
// active (else 400) before it can carry the event.
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

// Loads the item + target character and enforces the shared guards: item lives
// in this campaign (404), character is a member of it (400).
async function loadAwardContext(campaignId: string, campaignItemId: string, characterId: string) {
  const item = await prisma.campaignItem.findUnique({
    where: { id: campaignItemId },
    include: campaignItemInclude,
  });
  if (!item || item.campaignId !== campaignId) {
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

// Grant `quantity` of a campaign item into the target character's inventory.
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
    // Unique guard: a unique item may exist on only one sheet in the campaign.
    // Read the holder inside the transaction (alongside the create below) so a
    // concurrent award can't slip between an outside-the-tx check and the write.
    if (item.isUnique) {
      const held = await tx.inventoryItem.findFirst({
        where: { campaignItemId: item.id },
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
    const created = await tx.inventoryItem.create({
      data: {
        characterId: character.id,
        campaignItemId: item.id,
        name: item.name,
        category: item.category,
        weight: item.weight ?? undefined,
        cost: toJsonInput(item.cost),
        description: item.description ?? undefined,
        quantity,
        // Snapshot placement metadata (#565): gear slot + rarity for the Worn view.
        slot: item.slot,
        rarity: item.rarity,
        // Snapshot the attunement metadata so the attune check runs against
        // the frozen copy, not the mutable source (#545).
        requiresAttunement: item.requiresAttunement,
        attunementPrereqKind: item.attunementPrereqKind,
        attunementPrereqValue: item.attunementPrereqValue,
        position,
        ...snapshotCampaignItemDetail(item),
      },
    });

    if (item.link) {
      // Reveal only if still hidden; updateMany's compound where makes an
      // already-revealed entity a no-op (count 0).
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
        campaignItemId: item.id,
        recipientName: character.name,
      },
      actor: "dm",
      batchId,
      sessionId,
    });
  });
}

// Remove the provenance-matched inventory row from the target character.
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

  const row = await prisma.inventoryItem.findFirst({
    where: { characterId: character.id, campaignItemId: item.id },
    orderBy: { position: "desc" },
    include: inventoryItemDetailInclude,
  });
  if (!row) {
    throw new CampaignItemAwardError(404, `${character.name} does not hold ${item.name}`);
  }

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

// Current holders of each campaign item, derived from live InventoryItem rows.
// Returns a map keyed by campaignItemId; items with no holders are absent.
export async function campaignItemHolders(
  campaignItemIds: string[],
): Promise<Map<string, CampaignItemHolder[]>> {
  const map = new Map<string, CampaignItemHolder[]>();
  if (campaignItemIds.length === 0) return map;

  const rows = await prisma.inventoryItem.findMany({
    where: { campaignItemId: { in: campaignItemIds } },
    select: {
      campaignItemId: true,
      characterId: true,
      quantity: true,
      character: { select: { name: true } },
    },
  });

  for (const row of rows) {
    if (!row.campaignItemId) continue;
    const list = map.get(row.campaignItemId) ?? [];
    list.push({
      characterId: row.characterId,
      characterName: row.character.name,
      quantity: row.quantity,
    });
    map.set(row.campaignItemId, list);
  }
  return map;
}
