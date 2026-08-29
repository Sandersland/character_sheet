// Import direction is one-way: spellcasting -> ability-cost -> resources.
// InvalidSpellcastingOperationError is re-exported from spellcasting.ts so existing importers keep resolving it unchanged.

import { Prisma } from "@/generated/prisma/client.js";
import { applySpendResourceInTx, type SpendResourceOperation } from "@/lib/classes/resources.js";

// status = 400 maps to the client op-validation error via the central errorHandler.
export class InvalidSpellcastingOperationError extends Error {
  status = 400;
}

export type AbilityCost =
  | { kind: "slot"; minLevel: number }
  | { kind: "pool"; key: string; base: number; perStep?: number }
  | { kind: "none" };

export interface AbilityCostColumns {
  costKind?: string | null;
  costPoolKey?: string | null;
  costBase?: number | null;
  costPerStep?: number | null;
}

// Mirrors readEffectSpec in effects.ts.
// costKind "slot" (#1687) reuses costBase as minLevel — a slot cost and a pool cost never coexist on one row, so one Int? column serves both meanings.
export function readAbilityCost(row: AbilityCostColumns): AbilityCost {
  if (row.costKind === "slot") {
    return { kind: "slot", minLevel: row.costBase ?? 1 };
  }
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

export interface SlotCostSubject {
  verb: string;
  noun: string;
}

const SPELL_SLOT_SUBJECT: SlotCostSubject = { verb: "cast", noun: "spell" };

// Row-driven abilities (castAbilityWithSlotInTx) pass this so their below-minLevel error never says "spell" (#1687).
export const ABILITY_SLOT_SUBJECT: SlotCostSubject = { verb: "use", noun: "ability" };

export async function payAbilityCostInTx(
  ctx: PayCostContext,
  cost: AbilityCost,
  requested?: number,
  subject: SlotCostSubject = SPELL_SLOT_SUBJECT,
): Promise<PaidCost> {
  switch (cost.kind) {
    case "none":
      return { label: "", effectiveStep: 0 };
    case "slot":
      return paySlotCost(ctx, cost, requested, subject);
    case "pool":
      return payPoolCost(ctx, cost, requested);
  }
}

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
  requested: number | undefined,
  subject: SlotCostSubject,
): PaidCost {
  const state = requireSlotPayState(ctx);
  const slotLevel = requested ?? cost.minLevel;
  if (slotLevel < cost.minLevel) {
    throw new InvalidSpellcastingOperationError(
      `Cannot ${subject.verb} a level-${cost.minLevel} ${subject.noun} in a level-${slotLevel} slot`
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
  // perStep is reserved for future per-step effect scaling (F3) — unused here.
  const op: SpendResourceOperation = { type: "spendResource", key: cost.key, amount: requested };
  const audit = await applySpendResourceInTx(ctx.tx, ctx.characterId, op, ctx.batchId, ctx.sessionId);
  return { label: audit.summary, effectiveStep: (requested ?? cost.base) - cost.base };
}
