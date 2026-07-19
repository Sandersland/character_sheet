import { Prisma } from "@/generated/prisma/client.js";
import { describeAttunementPrereq, meetsAttunementPrereq } from "./capabilities.js";
import { clearBuffByKeyInTx } from "@/lib/combat/active-effects.js";
import { logEvent } from "@/lib/activity/events.js";
import { AttunementLimitError, InvalidInventoryOperationError } from "./inventory-currency.js";
import {
  type AttuneOperation,
  type UnattuneOperation,
  getOwnedInventoryItem,
  itemBuffKey,
} from "./inventory-types.js";

// 5e: a character can attune to at most 3 magic items (DMG p. 138). Derived
// (counted from live rows), never persisted.
const ATTUNEMENT_LIMIT = 3;

export async function applyAttune(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: AttuneOperation,
  batchId: string,
  sessionId: string | null,
) {
  const item = await getOwnedInventoryItem(tx, characterId, op.inventoryItemId);
  if (item.attuned) {
    throw new InvalidInventoryOperationError(`${item.name} is already attuned`);
  }

  // Prerequisite check against the snapshotted columns (5e "requires attunement
  // by a …"). Loads only the identity facts the check needs.
  if (item.attunementPrereqKind) {
    const character = await tx.character.findUnique({
      where: { id: characterId },
      select: {
        alignment: true,
        raceSelection: { select: { name: true } },
        classEntries: { select: { name: true, subclass: true } },
      },
    });
    const prereq = { kind: item.attunementPrereqKind, value: item.attunementPrereqValue };
    const subject = {
      classEntries: character?.classEntries ?? [],
      raceName: character?.raceSelection?.name ?? null,
      alignment: character?.alignment ?? null,
    };
    if (!meetsAttunementPrereq(prereq, subject)) {
      throw new InvalidInventoryOperationError(
        `${item.name} requires attunement by ${describeAttunementPrereq(prereq)}`,
      );
    }
  }

  // Derived 3-item cap: count currently-attuned rows, reject the 4th with a 409.
  const attunedCount = await tx.inventoryItem.count({ where: { characterId, attuned: true } });
  if (attunedCount >= ATTUNEMENT_LIMIT) {
    throw new AttunementLimitError(
      `Cannot attune to more than ${ATTUNEMENT_LIMIT} items — unattune one first`,
    );
  }

  await tx.inventoryItem.update({ where: { id: item.id }, data: { attuned: true } });

  await logEvent(tx, {
    characterId,
    category: "inventory",
    type: "attuned",
    summary: `Attuned to ${item.name}`,
    entityType: "InventoryItem",
    entityId: item.id,
    before: { attuned: false },
    after: { attuned: true },
    batchId,
    sessionId,
  });
}

export async function applyUnattune(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: UnattuneOperation,
  batchId: string,
  sessionId: string | null,
) {
  const item = await getOwnedInventoryItem(tx, characterId, op.inventoryItemId);
  if (!item.attuned) {
    throw new InvalidInventoryOperationError(`${item.name} is not attuned`);
  }

  await tx.inventoryItem.update({ where: { id: item.id }, data: { attuned: false } });

  // Unattuning ends any active effect once the item is no longer equipped either.
  if (item.equippedSlot == null) {
    await clearBuffByKeyInTx(tx, characterId, itemBuffKey(item.id), batchId, sessionId, `unattuned ${item.name}`);
  }

  await logEvent(tx, {
    characterId,
    category: "inventory",
    type: "unattuned",
    summary: `Ended attunement to ${item.name}`,
    entityType: "InventoryItem",
    entityId: item.id,
    before: { attuned: true },
    after: { attuned: false },
    batchId,
    sessionId,
  });
}
