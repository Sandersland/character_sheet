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

// 5e: a character can attune to at most 3 magic items (SRD 5.1 / SRD 5.2,
// "Attunement") — edition-invariant. Derived (counted from live rows), never
// persisted. Exported so serializeCharacter's `attunementCap` and the 409 below
// resolve to the SAME constant; keep it the only `3` in this file.
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

  // Prerequisite check against the snapshotted columns (5e "requires attunement
  // by a …"). Loads only the identity facts the check needs.
  if (item.attunementPrereqKind) {
    const character = await tx.character.findUnique({
      where: { id: characterId },
      select: {
        alignment: true,
        // #1684: species/variant relations, not raceSelection.name — the flat
        // Race model is gone, and CharacterRace.name is a drifting DISPLAY
        // snapshot (schema.prisma's own "free to drift independently" comment
        // on the selections-model pattern); a mechanical prerequisite check
        // should resolve against the catalog-linked identity instead. variant
        // (more specific, e.g. "Hill Dwarf") wins over species ("Dwarf");
        // raceSelection.name is the last fallback for a homebrew/no-species-FK
        // character (raw-inserted fixtures with no speciesId).
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

  // Serializes concurrent applyAttune calls for the SAME character before the
  // cap recount below: under Postgres' default READ COMMITTED, two concurrent
  // requests can each read the pre-write attuned count while the other's
  // UPDATE is still uncommitted, letting a 4th item attune past the cap
  // (#1888, same shape as the weapon-bond cap race fixed in #1854). Locking
  // the currently-attuned InventoryItem rows doesn't work here — the new row
  // being attuned doesn't match the `attuned: true` predicate yet, so it's a
  // phantom-read case; only a lock on the Character row itself blocks the
  // second request until the first's count-then-update has committed.
  await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${characterId} FOR UPDATE`;

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
