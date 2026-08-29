import { Prisma } from "@/generated/prisma/client.js";
import { describeAttunementPrereq, meetsAttunementPrereq } from "./capabilities.js";
import { clearBuffByKeyInTx } from "@/lib/combat/buff-end.js";
import { logEvent } from "@/lib/activity/events.js";
import { AttunementLimitError, InvalidInventoryOperationError } from "./inventory-currency.js";
import {
  type AttuneOperation,
  type UnattuneOperation,
  getOwnedInventoryItem,
  itemBuffKey,
} from "./inventory-types.js";

// SRD 5.1 / SRD 5.2, "Attunement": a character can attune to at most 3 magic items (edition-invariant).
// Exported so serializeCharacter's `attunementCap` and the 409 below resolve to the SAME constant; keep this the only `3` in this file.
export const ATTUNEMENT_LIMIT = 3;

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

  if (item.attunementPrereqKind) {
    const character = await tx.character.findUnique({
      where: { id: characterId },
      select: {
        alignment: true,
        // #1684: a mechanical check must resolve against the catalog-linked species/variant, not the drifting raceSelection.name display snapshot; variant wins over species, raceSelection.name is the last fallback for a no-speciesId fixture.
        raceSelection: { select: { name: true, species: { select: { name: true } }, variant: { select: { name: true } } } },
        classEntries: {
          select: { name: true, subclassRef: { select: { casterFraction: true, spellcastingAbility: true } } },
        },
      },
    });
    const prereq = { kind: item.attunementPrereqKind, value: item.attunementPrereqValue };
    const subject = {
      classEntries: character?.classEntries ?? [],
      raceName:
        character?.raceSelection?.variant?.name
        ?? character?.raceSelection?.species?.name
        ?? character?.raceSelection?.name
        ?? null,
      alignment: character?.alignment ?? null,
    };
    if (!meetsAttunementPrereq(prereq, subject)) {
      throw new InvalidInventoryOperationError(
        `${item.name} requires attunement by ${describeAttunementPrereq(prereq)}`,
      );
    }
  }

  // #1888 (same shape as #1854): under READ COMMITTED, two concurrent attunes can each read the pre-write count and both pass the cap — a phantom read, since the row being attuned doesn't match `attuned: true` yet. Locking the Character row (not the InventoryItem rows) is what serializes them.
  await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${characterId} FOR UPDATE`;

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
