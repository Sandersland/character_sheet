import { Prisma } from "@/generated/prisma/client.js";
import { rollDie } from "@/lib/core/dice.js";
import { logEvent } from "@/lib/activity/events.js";
import { applyHealInTx } from "@/lib/combat/hitpoints.js";
import { InvalidInventoryOperationError } from "./inventory-currency.js";
import {
  type UseOperation,
  type UseResult,
  type InventoryItemWithDetails,
  getOwnedInventoryItem,
} from "./inventory-types.js";
import {
  type DeletedInventoryItemSnapshot,
  snapshotInventoryItemForUndo,
} from "./inventory-snapshot.js";

// A consumable auto-applies its effect only when it heals (#121). Non-heal
// effects are rolled + recorded but never applied server-side.
export function isHealingConsumable(effectDescription: string | null | undefined): boolean {
  if (!effectDescription) return false;
  return /hit point|\bheal/i.test(effectDescription);
}

type ConsumableDetail = InventoryItemWithDetails["consumableDetail"];

// A consumable's effect-dice metadata (0 count/faces ⇒ no roll).
function consumableEffectDice(detail: ConsumableDetail): { diceCount: number; faces: number; modifier: number } {
  return {
    diceCount: detail?.effectDiceCount ?? 0,
    faces: detail?.effectDiceFaces ?? 0,
    modifier: detail?.effectModifier ?? 0,
  };
}

// Rolls a consumable's effect dice — client-supplied for the 3D animation, else
// server-rolled — validating any supplied rolls. total is null when it has no dice.
function rollConsumableEffect(
  op: UseOperation,
  item: InventoryItemWithDetails,
  detail: ConsumableDetail,
): { rolls: number[]; modifier: number; total: number | null } {
  const { diceCount, faces, modifier } = consumableEffectDice(detail);
  if (diceCount <= 0 || faces <= 0) return { rolls: [], modifier, total: null };
  let rolls: number[];
  if (op.rolls) {
    if (op.rolls.length !== diceCount || op.rolls.some((r) => r < 1 || r > faces)) {
      throw new InvalidInventoryOperationError(
        `${item.name} effect roll must be ${diceCount}d${faces}`,
      );
    }
    rolls = op.rolls;
  } else {
    rolls = Array.from({ length: diceCount }, () => rollDie(faces));
  }
  return { rolls, modifier, total: rolls.reduce((sum, r) => sum + r, 0) + modifier };
}

// The event before/after snapshots + row-effect of consuming one use. Decrements
// usesRemaining (charged) or quantity (stackable); throws when nothing is left.
interface UseDecrement {
  before: Record<string, unknown>;
  after: Record<string, unknown> | null;
  deletedItem: DeletedInventoryItemSnapshot | undefined;
  remainingUses: number | null;
  remainingQty: number | null;
}

function computeUseDecrement(
  item: InventoryItemWithDetails,
  detail: ConsumableDetail,
  charged: boolean,
): UseDecrement {
  if (charged) {
    const current = detail?.usesRemaining ?? 0;
    if (current <= 0) {
      throw new InvalidInventoryOperationError(`${item.name} has no uses remaining`);
    }
    const remainingUses = current - 1;
    return {
      before: { usesRemaining: current },
      after: { usesRemaining: remainingUses },
      deletedItem: undefined,
      remainingUses,
      remainingQty: null,
    };
  }
  if (item.quantity <= 0) {
    throw new InvalidInventoryOperationError(`${item.name} has none left to use`);
  }
  const remainingQty = item.quantity - 1;
  return {
    before: { quantity: item.quantity },
    after: remainingQty === 0 ? null : { quantity: remainingQty },
    deletedItem: remainingQty === 0 ? snapshotInventoryItemForUndo(item) : undefined,
    remainingUses: null,
    remainingQty,
  };
}

// Writes the computed decrement to the row: charged updates usesRemaining, a
// depleted stackable deletes the row, otherwise the quantity drops by one.
async function persistUseDecrement(
  tx: Prisma.TransactionClient,
  item: InventoryItemWithDetails,
  charged: boolean,
  remainingUses: number | null,
  remainingQty: number | null,
) {
  if (charged) {
    await tx.inventoryConsumableDetail.update({
      where: { inventoryItemId: item.id },
      data: { usesRemaining: remainingUses ?? 0 },
    });
  } else if (remainingQty === 0) {
    await tx.inventoryItem.delete({ where: { id: item.id } });
  } else {
    await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: remainingQty ?? 0 } });
  }
}

// Auto-applies a consumable's healing only — non-heal effects are rolled and
// recorded but never applied server-side (#121). Returns "heal" when it applied.
async function applyConsumableHeal(
  tx: Prisma.TransactionClient,
  characterId: string,
  item: InventoryItemWithDetails,
  detail: ConsumableDetail,
  total: number | null,
  batchId: string,
  sessionId: string | null,
): Promise<"heal" | null> {
  if (!isHealingConsumable(detail?.effectDescription) || total === null || total <= 0) return null;
  await applyHealInTx(tx, characterId, total, batchId, sessionId, { source: item.name });
  return "heal";
}

// Consumes one use of a consumable (#121). Ammo is gear, not consumable, so it
// is excluded here without any ammoKind dependency. Rolls the effect dice, logs
// a `consumed` event with the roll in `data`, and auto-applies ONLY healing.
export async function applyUse(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: UseOperation,
  batchId: string,
  sessionId: string | null,
): Promise<UseResult> {
  const item = await getOwnedInventoryItem(tx, characterId, op.inventoryItemId);
  if (item.category !== "consumable") {
    throw new InvalidInventoryOperationError(`${item.name} (${item.category}) is not a consumable`);
  }
  const detail = item.consumableDetail;
  const charged = detail?.maxUses != null;

  const { rolls, modifier, total } = rollConsumableEffect(op, item, detail);
  const { before, after, deletedItem, remainingUses, remainingQty } = computeUseDecrement(item, detail, charged);
  const applied = await applyConsumableHeal(tx, characterId, item, detail, total, batchId, sessionId);

  await logEvent(tx, {
    characterId,
    category: "inventory",
    type: "consumed",
    summary: total !== null ? `Used ${item.name} (rolled ${total})` : `Used ${item.name}`,
    entityType: "InventoryItem",
    entityId: item.id,
    before,
    after,
    data: {
      itemName: item.name,
      use: true,
      rolls,
      effectModifier: modifier,
      total,
      applied,
      effectDescription: detail?.effectDescription ?? null,
      ...(deletedItem ? { deletedItem } : {}),
    },
    batchId,
    sessionId,
  });

  await persistUseDecrement(tx, item, charged, remainingUses, remainingQty);

  return {
    inventoryItemId: item.id,
    itemName: item.name,
    effectDescription: detail?.effectDescription ?? null,
    rolls,
    effectModifier: modifier,
    total,
    applied,
    usesRemaining: remainingUses,
    quantity: remainingQty,
  };
}
