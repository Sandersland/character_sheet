import { Prisma } from "@/generated/prisma/client.js";
import {
  activatedMaxUses,
  activatedRechargeRest,
  chargePoolOf,
  type ChargesCapability,
  readCapability,
  type ActivatedEffectCapability,
} from "./capabilities.js";
import {
  appendActiveBuffInTx,
  normalizeActiveEffectsMutable,
} from "@/lib/combat/active-effects.js";
import { clearBuffByKeyInTx } from "@/lib/combat/buff-end.js";
import { logEvent } from "@/lib/activity/events.js";
import { InvalidInventoryOperationError } from "./inventory-currency.js";
import {
  type ActivateOperation,
  type DeactivateOperation,
  type InventoryItemWithDetails,
  getOwnedInventoryItem,
  itemBuffKey,
} from "./inventory-types.js";

function activatedCapabilityOf(item: InventoryItemWithDetails): ActivatedEffectCapability | null {
  for (const col of item.capabilities) {
    const cap = readCapability(col);
    // Type-predicate guard, not a bare kind check: an opaque row with kind="activatedEffect" but no activation must not slip through, or applyActivate would seed a buff with target/modifier undefined.
    if (cap.kind === "activatedEffect" && "activation" in cap) return cap;
  }
  return null;
}

// #555: typed off the live include so the pool row carries its runtime `used` counter.
type ChargePool = { cap: ChargesCapability; row: InventoryItemWithDetails["capabilities"][number] };

// The already-active guard comes FIRST, before the uses check, so an active last-charge item reports "already active", not "no uses" — a second activation would dedupe the buff but still waste a charge.
async function assertActivatable(
  tx: Prisma.TransactionClient,
  characterId: string,
  item: InventoryItemWithDetails,
  cap: ActivatedEffectCapability,
) {
  if (item.equippedSlot == null && !item.attuned) {
    throw new InvalidInventoryOperationError(`${item.name} must be equipped or attuned to activate`);
  }
  const charRow = await tx.character.findUnique({ where: { id: characterId }, select: { activeEffects: true } });
  const cur = normalizeActiveEffectsMutable(charRow?.activeEffects ?? null);
  if (cur.buffs.some((b) => b.key === itemBuffKey(item.id))) {
    throw new InvalidInventoryOperationError(`${item.name} is already active`);
  }
  const maxUses = activatedMaxUses(cap);
  if (maxUses !== null && item.activatedUsesSpent >= maxUses) {
    throw new InvalidInventoryOperationError(`${item.name} has no uses remaining — recharges on a rest`);
  }
}

// #555: nulls when the activation spends the per-item use counter instead of a pool.
function resolveActivationCharges(
  item: InventoryItemWithDetails,
  cap: ActivatedEffectCapability,
): { pool: ChargePool | null; chargeCost: number | null } {
  if (cap.resourceKind !== "charges") return { pool: null, chargeCost: null };
  const pool = chargePoolOf(item.capabilities);
  const chargeCost = Math.max(1, cap.chargeCost);
  if (!pool) {
    throw new InvalidInventoryOperationError(`${item.name} has no charges pool to spend from`);
  }
  const poolRemaining = Math.max(0, pool.cap.maxCharges - (pool.row.used ?? 0));
  if (poolRemaining < chargeCost) {
    throw new InvalidInventoryOperationError(
      `${item.name} needs ${chargeCost} charge${chargeCost === 1 ? "" : "s"} — ${poolRemaining} remaining`,
    );
  }
  return { pool, chargeCost };
}

// TOCTOU guard, same as applyCastItemSpellOp: the WHERE re-evaluates under the row's write lock so concurrent spenders can't push `used` past maxCharges; a loser's batch rolls back.
async function spendActivationCharges(
  tx: Prisma.TransactionClient,
  item: InventoryItemWithDetails,
  pool: ChargePool,
  chargeCost: number,
): Promise<{ before: number; after: number }> {
  const spent = await tx.inventoryCapabilityUse.updateMany({
    where: { capabilityKey: pool.row.id, used: { lte: pool.cap.maxCharges - chargeCost } },
    data: { used: { increment: chargeCost } },
  });
  if (spent.count === 0) {
    throw new InvalidInventoryOperationError(
      `${item.name} needs ${chargeCost} charge${chargeCost === 1 ? "" : "s"} — too few remaining`,
    );
  }
  // Re-read for the event snapshot: under a race the pre-read `pool.row.used` is stale.
  const fresh = await tx.inventoryCapabilityUse.findFirstOrThrow({
    where: { capabilityKey: pool.row.id },
    select: { used: true },
  });
  return { after: fresh.used, before: fresh.used - chargeCost };
}

async function seedActivationBuff(
  tx: Prisma.TransactionClient,
  characterId: string,
  item: InventoryItemWithDetails,
  cap: ActivatedEffectCapability,
  batchId: string,
  sessionId: string | null,
) {
  const duration = cap.duration === "untilRest" ? "until-rest" : "while-active";
  const restType = duration === "until-rest" ? (activatedRechargeRest(cap) ?? "long") : undefined;
  await appendActiveBuffInTx(
    tx,
    characterId,
    {
      key: itemBuffKey(item.id),
      target: cap.target,
      modifier: cap.value,
      source: item.name,
      sourceEntryId: itemBuffKey(item.id),
      duration,
      ...(restType ? { restType } : {}),
    },
    batchId,
    sessionId,
  );
}

function activationRemaining(
  pool: ChargePool | null,
  chargeCost: number | null,
  poolUsedAfter: number | null,
  maxUses: number | null,
  nextSpent: number,
): number | null {
  if (pool && chargeCost != null) return Math.max(0, pool.cap.maxCharges - poolUsedAfter!);
  return maxUses !== null ? maxUses - nextSpent : null;
}

function activateSummary(itemName: string, hasPool: boolean, remaining: number | null): string {
  if (hasPool && remaining !== null) {
    return `Activated ${itemName} (${remaining} charge${remaining === 1 ? "" : "s"} left)`;
  }
  if (remaining !== null) return `Activated ${itemName} (${remaining} left)`;
  return `Activated ${itemName}`;
}

// capabilityUsed is included only when the spend came from a pool.
function activationSnapshot(
  spent: number,
  pool: ChargePool | null,
  chargeCost: number | null,
  poolUsed: number | null,
): Record<string, unknown> {
  return {
    activatedUsesSpent: spent,
    ...(pool && chargeCost != null ? { capabilityUsed: { capabilityId: pool.row.id, used: poolUsed } } : {}),
  };
}

export async function applyActivate(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: ActivateOperation,
  batchId: string,
  sessionId: string | null,
) {
  const item = await getOwnedInventoryItem(tx, characterId, op.inventoryItemId);
  const cap = activatedCapabilityOf(item);
  if (!cap) {
    throw new InvalidInventoryOperationError(`${item.name} has no activated effect`);
  }
  await assertActivatable(tx, characterId, item, cap);
  const { pool, chargeCost } = resolveActivationCharges(item, cap);

  await seedActivationBuff(tx, characterId, item, cap, batchId, sessionId);

  const maxUses = activatedMaxUses(cap);
  const nextSpent = maxUses !== null ? item.activatedUsesSpent + 1 : item.activatedUsesSpent;
  if (maxUses !== null) {
    await tx.inventoryItem.update({ where: { id: item.id }, data: { activatedUsesSpent: nextSpent } });
  }
  // capabilityUsed before/after makes the revert restore the pool, symmetric with the activatedUsesSpent snapshots.
  let poolUsedBefore: number | null = null;
  let poolUsedAfter: number | null = null;
  if (pool && chargeCost != null) {
    const { before, after } = await spendActivationCharges(tx, item, pool, chargeCost);
    poolUsedBefore = before;
    poolUsedAfter = after;
  }

  const remaining = activationRemaining(pool, chargeCost, poolUsedAfter, maxUses, nextSpent);
  await logEvent(tx, {
    characterId,
    category: "inventory",
    type: "activated",
    summary: activateSummary(item.name, pool != null, remaining),
    entityType: "InventoryItem",
    entityId: item.id,
    before: activationSnapshot(item.activatedUsesSpent, pool, chargeCost, poolUsedBefore),
    after: activationSnapshot(nextSpent, pool, chargeCost, poolUsedAfter),
    data: { itemName: item.name, remaining, ...(chargeCost != null ? { chargesSpent: chargeCost } : {}) },
    batchId,
    sessionId,
  });
}

// The spent use stays spent until the recharge rest.
export async function applyDeactivate(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: DeactivateOperation,
  batchId: string,
  sessionId: string | null,
) {
  const item = await getOwnedInventoryItem(tx, characterId, op.inventoryItemId);
  await clearBuffByKeyInTx(tx, characterId, itemBuffKey(item.id), batchId, sessionId, `deactivated ${item.name}`);

  await logEvent(tx, {
    characterId,
    category: "inventory",
    type: "deactivated",
    summary: `Deactivated ${item.name}`,
    entityType: "InventoryItem",
    entityId: item.id,
    // Non-null empty snapshots: the buff re-applies via the paired effects-event revert, so this inventory event is a no-op on undo (must not read as a create).
    before: {},
    after: {},
    data: { itemName: item.name },
    batchId,
    sessionId,
  });
}
