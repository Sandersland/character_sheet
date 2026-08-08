/**
 * resolveAction transaction handler (#1829, epic #1827 slice 2) — the backend
 * half of the unified combat-action resolver: a weapon swing or spell cast
 * persists as ONE undoable `CharacterEvent` whose `data` carries the rolls,
 * instead of the separate attackRoll/damageRoll/castSpell rows the old
 * per-domain paths write. Those old paths (logRoll, castSpell) are untouched —
 * this is additive; the frontend adopts resolveAction in slices #1832/#1833.
 *
 * The only state delta this slice handles is a leveled spell's slot spend
 * (`slotLevel` on the op) — paid through the same `loadSlotPayContext` +
 * `payAbilityCostInTx` preamble `castSpell`/`castAbilityWithSlotInTx` use, so
 * slot-table derivation, Mystic Arcanum fallback, and the "no slots
 * remaining" guard are each the ONE shared implementation, not a second copy.
 * A cantrip or weapon resolution (`slotLevel` omitted) has no server-side
 * state to spend — the event is still written, with no before/after
 * snapshot, so it appears on the timeline and is still LIFO-revertible
 * (nothing to restore, but the batch is still markable reverted). A
 * row-driven RESOURCE cost (the design's other `data.slotLevel`-adjacent
 * case) is deliberately out of scope for this slice — no acceptance
 * criterion here exercises it — and is flagged in the slice report.
 */

import { Prisma } from "@/generated/prisma/client.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import { logEvent } from "@/lib/activity/events.js";
import {
  ABILITY_SLOT_SUBJECT,
  InvalidSpellcastingOperationError,
  payAbilityCostInTx,
} from "@/lib/spellcasting/ability-cost.js";
import { loadSlotPayContext } from "@/lib/spellcasting/spellcasting.js";
import { snapshotSpellcasting } from "@/lib/spellcasting/spell-state.js";
import {
  resolveActionOperationSchema,
  type ResolveActionOperation,
} from "./resolve-action-ops.js";

export { resolveActionOperationSchema, type ResolveActionOperation };

// status → the 400 the central `errorHandler` maps (client op-validation error).
export class InvalidResolveActionOperationError extends Error {
  status = 400;
}

// Pays the op's `slotLevel` (if any) against the character's own slot/arcanum
// state and returns the before/after spellcasting snapshot for the event —
// or null before/after when the op has no slot cost (cantrip/weapon).
async function payResolveActionCost(
  tx: Prisma.TransactionClient,
  characterId: string,
  batchId: string,
  sessionId: string | null,
  op: ResolveActionOperation,
): Promise<{ before: Record<string, unknown> | null; after: Record<string, unknown> | null }> {
  if (op.slotLevel == null) return { before: null, after: null };

  // Shared "load → derive → build cost context" preamble with
  // castAbilityWithSlotInTx (spellcasting.ts) — own not-found error kept
  // (400 domain error here vs that caller's 5xx internal invariant).
  const { state, costCtx } = await loadSlotPayContext(
    tx,
    characterId,
    batchId,
    sessionId,
    (id) => new InvalidResolveActionOperationError(`Character not found: ${id}`),
  );
  const before = snapshotSpellcasting(state);

  // Reuses the same payer castSpell/castAbilityWithSlotInTx pay through —
  // Mystic Arcanum fallback and the "no slots remaining" guard live in ONE
  // place (ability-cost.ts), not re-implemented here. Mutates
  // state.slotsUsed/arcanumUsed in place (same aliasing costCtx sets up).
  await payAbilityCostInTx(costCtx, { kind: "slot", minLevel: op.slotLevel }, op.slotLevel, ABILITY_SLOT_SUBJECT);

  const after = snapshotSpellcasting(state);
  await tx.character.update({
    where: { id: characterId },
    data: { spellcasting: after.spellcasting as unknown as Prisma.InputJsonValue },
  });

  return { before, after };
}

function summaryFor(op: ResolveActionOperation): string {
  const costWord = op.cost.attacks && op.cost.attacks > 1 ? `${op.cost.attacks} attacks` : op.cost.kind;
  return `Resolved ${op.source} (${costWord})`;
}

/**
 * Applies a batch of resolveAction operations atomically. Mirrors
 * applySpellcastingOperations/applyHitPointOperations: one batchId, one
 * $transaction, one CharacterEvent per op (category "combat", type
 * "resolveAction") — the single audit row a resolution's undo reverses.
 */
export async function applyResolveActionOperations(
  characterId: string,
  operations: ResolveActionOperation[],
): Promise<void> {
  await runCharacterTransaction(characterId, operations, {
    select: { id: true },
    notFound: (id) => new InvalidResolveActionOperationError(`Character not found: ${id}`),
    applyOp: async ({ tx, op, characterId: id, batchId, sessionId }) => {
      const { before, after } = await payResolveActionCost(tx, id, batchId, sessionId, op);

      await logEvent(tx, {
        characterId: id,
        category: "combat",
        type: "resolveAction",
        summary: summaryFor(op),
        before,
        after,
        data: {
          actionId: op.actionId,
          source: op.source,
          cost: op.cost,
          toHit: op.toHit ?? null,
          save: op.save ?? null,
          effect: op.effect ?? null,
          slotLevel: op.slotLevel ?? null,
        },
        batchId,
        sessionId,
      });
    },
  });
}

export { InvalidSpellcastingOperationError };
