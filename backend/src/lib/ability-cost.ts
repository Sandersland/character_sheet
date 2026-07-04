/**
 * Ability cost abstraction — one payer for "what a class ability costs".
 *
 * Decouples "cast a spell / use an ability" from "spend the resource it costs".
 * A cost is declared as a slot (level-N spell slot, with Mystic Arcanum
 * fallback), a pool spend (ki, superiority dice, …), or none (cantrips). The
 * single payer payAbilityCostInTx() charges it inside a caller-supplied
 * transaction and returns a human label + the effective upcast/overspend step.
 *
 * Import direction is one-way: spellcasting → ability-cost → resources. The
 * InvalidSpellcastingOperationError lives here (moved from spellcasting.ts) and
 * is re-exported there so existing importers keep resolving it unchanged.
 */

import { Prisma } from "../generated/prisma/client.js";
import { applySpendResourceInTx, type SpendResourceOperation } from "./resources.js";

// ── Error class ───────────────────────────────────────────────────────────────

export class InvalidSpellcastingOperationError extends Error {}

// ── Cost declaration ────────────────────────────────────────────────────────

export type AbilityCost =
  | { kind: "slot"; minLevel: number }
  | { kind: "pool"; key: string; base: number; perStep?: number }
  | { kind: "none" };

export interface PayCostContext {
  tx: Prisma.TransactionClient;
  characterId: string;
  batchId: string;
  sessionId: string | null;
  slotsUsed?: Record<string, number>;   // mutated in place (slot only)
  arcanumUsed?: Record<string, number>; // mutated in place (slot only)
  slotTotals?: Record<number, number>;
  arcanaTotals?: Record<number, number>;
}

export interface PaidCost {
  label: string;
  effectiveStep: number;
}

export async function payAbilityCostInTx(
  ctx: PayCostContext,
  cost: AbilityCost,
  requested?: number,
): Promise<PaidCost> {
  switch (cost.kind) {
    case "none":
      return { label: "", effectiveStep: 0 };
    case "slot":
      return paySlotCost(ctx, cost, requested);
    case "pool":
      return payPoolCost(ctx, cost, requested);
  }
}

function paySlotCost(
  ctx: PayCostContext,
  cost: Extract<AbilityCost, { kind: "slot" }>,
  requested?: number,
): PaidCost {
  const { slotsUsed, arcanumUsed, slotTotals, arcanaTotals } = ctx;
  if (!slotsUsed || !arcanumUsed || !slotTotals || !arcanaTotals) {
    throw new Error("payAbilityCostInTx: slot cost requires slot/arcanum maps + totals");
  }
  const slotLevel = requested ?? cost.minLevel;
  if (slotLevel < cost.minLevel) {
    throw new InvalidSpellcastingOperationError(
      `Cannot cast a level-${cost.minLevel} spell in a level-${slotLevel} slot`
    );
  }
  const slotTotal = slotTotals[slotLevel] ?? 0;
  const arcanumTotal = arcanaTotals[slotLevel] ?? 0;
  const upcasting = slotLevel > cost.minLevel;

  let label: string;
  if (slotTotal > 0) {
    const used = slotsUsed[String(slotLevel)] ?? 0;
    if (used >= slotTotal) {
      throw new InvalidSpellcastingOperationError(
        `No level-${slotLevel} spell slots remaining`
      );
    }
    slotsUsed[String(slotLevel)] = used + 1;
    label = `L${slotLevel} slot${upcasting ? ` (upcast from L${cost.minLevel})` : ""}`;
  } else if (arcanumTotal > 0) {
    const used = arcanumUsed[String(slotLevel)] ?? 0;
    if (used >= arcanumTotal) {
      throw new InvalidSpellcastingOperationError(
        `Mystic Arcanum (level ${slotLevel}) already used — recharges on a long rest`
      );
    }
    arcanumUsed[String(slotLevel)] = used + 1;
    label = `L${slotLevel} Mystic Arcanum`;
  } else {
    throw new InvalidSpellcastingOperationError(
      `No level-${slotLevel} spell slots remaining`
    );
  }

  return { label, effectiveStep: slotLevel - cost.minLevel };
}

async function payPoolCost(
  ctx: PayCostContext,
  cost: Extract<AbilityCost, { kind: "pool" }>,
  requested?: number,
): Promise<PaidCost> {
  // perStep is reserved for F3 (per-step effect scaling); unused here.
  const op: SpendResourceOperation = { type: "spendResource", key: cost.key, amount: requested };
  const audit = await applySpendResourceInTx(ctx.tx, ctx.characterId, op, ctx.batchId, ctx.sessionId);
  return { label: audit.summary, effectiveStep: (requested ?? 1) - cost.base };
}
