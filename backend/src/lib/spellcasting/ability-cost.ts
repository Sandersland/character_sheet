/**
 * Ability cost abstraction — one payer for "what a class ability costs".
 *
 * Decouples "cast a spell / use an ability" from "spend the resource it costs".
 * A cost is declared as a slot (level-N spell slot, with Mystic Arcanum
 * fallback), a pool spend (focus, superiority dice, …), or none (cantrips). The
 * single payer payAbilityCostInTx() charges it inside a caller-supplied
 * transaction and returns a human label + the effective upcast/overspend step.
 *
 * Import direction is one-way: spellcasting → ability-cost → resources. The
 * InvalidSpellcastingOperationError lives here (moved from spellcasting.ts) and
 * is re-exported there so existing importers keep resolving it unchanged.
 */

import { Prisma } from "@/generated/prisma/client.js";
import { applySpendResourceInTx, type SpendResourceOperation } from "@/lib/classes/resources.js";

// status → the 400 the central `errorHandler` maps (client op-validation error).
export class InvalidSpellcastingOperationError extends Error {
  status = 400;
}

export type AbilityCost =
  | { kind: "slot"; minLevel: number }
  | { kind: "pool"; key: string; base: number; perStep?: number }
  | { kind: "none" };

// Flat cost columns snapshotted from a catalog row (a GrantedAbility catalog row).
export interface AbilityCostColumns {
  costKind?: string | null;
  costPoolKey?: string | null;
  costBase?: number | null;
  costPerStep?: number | null;
}

// Adapter over the flat cost columns — mirrors readEffectSpec in effects.ts.
export function readAbilityCost(row: AbilityCostColumns): AbilityCost {
  if (row.costKind === "pool" && row.costPoolKey) {
    return {
      kind: "pool",
      key: row.costPoolKey,
      base: row.costBase ?? 0,
      perStep: row.costPerStep ?? undefined,
    };
  }
  return { kind: "none" };
}

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

// Required slot/arcanum maps + totals a slot-cost payment mutates/reads —
// narrowed out of the optional PayCostContext fields once by the caller.
interface SlotPayState {
  slotsUsed: Record<string, number>;
  arcanumUsed: Record<string, number>;
  slotTotals: Record<number, number>;
  arcanaTotals: Record<number, number>;
}

function requireSlotPayState(ctx: PayCostContext): SlotPayState {
  const { slotsUsed, arcanumUsed, slotTotals, arcanaTotals } = ctx;
  if (!slotsUsed || !arcanumUsed || !slotTotals || !arcanaTotals) {
    throw new Error("payAbilityCostInTx: slot cost requires slot/arcanum maps + totals");
  }
  return { slotsUsed, arcanumUsed, slotTotals, arcanaTotals };
}

// Spends one level-`slotLevel` spell slot, or throws if none remain.
function spendSlot(state: SlotPayState, slotLevel: number, minLevel: number): string {
  const used = state.slotsUsed[String(slotLevel)] ?? 0;
  const total = state.slotTotals[slotLevel] ?? 0;
  if (used >= total) {
    throw new InvalidSpellcastingOperationError(`No level-${slotLevel} spell slots remaining`);
  }
  state.slotsUsed[String(slotLevel)] = used + 1;
  const upcasting = slotLevel > minLevel;
  return `L${slotLevel} slot${upcasting ? ` (upcast from L${minLevel})` : ""}`;
}

// Spends one level-`slotLevel` Mystic Arcanum charge, or throws if already used.
function spendArcanum(state: SlotPayState, slotLevel: number): string {
  const used = state.arcanumUsed[String(slotLevel)] ?? 0;
  const total = state.arcanaTotals[slotLevel] ?? 0;
  if (used >= total) {
    throw new InvalidSpellcastingOperationError(
      `Mystic Arcanum (level ${slotLevel}) already used — recharges on a long rest`
    );
  }
  state.arcanumUsed[String(slotLevel)] = used + 1;
  return `L${slotLevel} Mystic Arcanum`;
}

function paySlotCost(
  ctx: PayCostContext,
  cost: Extract<AbilityCost, { kind: "slot" }>,
  requested?: number,
): PaidCost {
  const state = requireSlotPayState(ctx);
  const slotLevel = requested ?? cost.minLevel;
  if (slotLevel < cost.minLevel) {
    throw new InvalidSpellcastingOperationError(
      `Cannot cast a level-${cost.minLevel} spell in a level-${slotLevel} slot`
    );
  }

  let label: string;
  if ((state.slotTotals[slotLevel] ?? 0) > 0) {
    label = spendSlot(state, slotLevel, cost.minLevel);
  } else if ((state.arcanaTotals[slotLevel] ?? 0) > 0) {
    label = spendArcanum(state, slotLevel);
  } else {
    throw new InvalidSpellcastingOperationError(`No level-${slotLevel} spell slots remaining`);
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
  return { label: audit.summary, effectiveStep: (requested ?? cost.base) - cost.base };
}
