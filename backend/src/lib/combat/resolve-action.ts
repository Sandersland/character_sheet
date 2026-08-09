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
import { castSpellForResolutionInTx, loadSlotPayContext } from "@/lib/spellcasting/spellcasting.js";
import { snapshotSpellcasting } from "@/lib/spellcasting/spell-state.js";
import { recordTurnSpellCast } from "@/lib/session/sessions.js";
import {
  resolveActionOperationSchema,
  type ResolveActionOperation,
} from "./resolve-action-ops.js";
import type { CastSpellOperation } from "@character-sheet/shared-types";

export { resolveActionOperationSchema, type ResolveActionOperation };

// status → the 400 the central `errorHandler` maps (client op-validation error).
export class InvalidResolveActionOperationError extends Error {
  status = 400;
}

// Pays the op's `slotLevel` (if any) against the character's own slot/arcanum
// state and returns the before/after spellcasting snapshot for the event —
// or null before/after when the op has no slot cost (cantrip/weapon). This is
// the pre-#1833 bare-slot-spend path, kept for a weapon/generic op that omits
// `entryId` — an entryId-bearing op (a spell resolution) instead runs
// payActionCostAndSideEffectsInTx's other branch below, which pays the SAME
// cost through the SAME payer but also carries concentration/buff/self-apply.
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

// The universal cost + side-effects router for BOTH branches a resolveAction
// op can take (#1848 review — the pre-rename `applySpellCastSideEffects`
// named only the second, spell-shaped branch, misleading a reader tracing a
// WEAPON op's failure through applyResolveActionOperations): a weapon or
// cantrip-with-no-entryId op (`op.entryId == null`) delegates to
// payResolveActionCost's bare slot-spend; an entryId-bearing spell op
// (#1833) routes the op's slotLevel/apply through the SAME castAbilityInTx
// sequence the old castSpell op uses (castSpellForResolutionInTx), so
// concentration (set + displaced-prior drop), a buff spell's self-buff
// (Mage Armor), and a self/ally heal/damage apply all still happen — not
// just the slot spend payResolveActionCost pays alone. `roll` feeds
// castAbilityInTx's own eventData/apply-amount plumbing; the resolveAction
// event logged by the caller carries the actual rail data (toHit/save/
// effect/riders) separately, so `roll`'s own eventData never surfaces on
// the wire.
async function payActionCostAndSideEffectsInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  batchId: string,
  sessionId: string | null,
  casterUserId: string,
  op: ResolveActionOperation,
): Promise<{ before: Record<string, unknown> | null; after: Record<string, unknown> | null }> {
  if (op.entryId == null) {
    return payResolveActionCost(tx, characterId, batchId, sessionId, op);
  }
  const castOp: CastSpellOperation = {
    type: "castSpell",
    entryId: op.entryId,
    ...(op.slotLevel !== undefined ? { slotLevel: op.slotLevel } : {}),
    roll: op.effect?.total ?? 0,
    ...(op.apply ? { apply: op.apply } : {}),
  };
  const { before, after } = await castSpellForResolutionInTx(
    tx,
    characterId,
    batchId,
    sessionId,
    casterUserId,
    castOp,
  );
  return { before, after };
}

// Record the per-turn spell-cast kind for the 5e bonus-action interlock (#1439)
// — only a spell resolution (entryId present) whose character is in an active
// session; a weapon swing has no entryId and no interlock. `kind` is leveled
// iff a slot was spent (a cantrip has no slotLevel). Kept out of applyOp so its
// own guard doesn't count against that function's complexity budget.
async function recordSpellCastForOp(
  tx: Prisma.TransactionClient,
  sessionId: string | null,
  characterId: string,
  op: ResolveActionOperation,
): Promise<void> {
  if (op.entryId == null || sessionId == null) return;
  await recordTurnSpellCast(tx, sessionId, characterId, op.cost.kind, op.slotLevel != null ? "leveled" : "cantrip");
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
 *
 * `casterUserId` (#1833) is the authenticated caller — unused by a weapon/
 * cantrip-with-no-apply resolution, but required to route a spell's self/ally
 * heal apply (party-target healing #462 needs the caster's identity to check
 * campaign membership), the same parameter applySpellcastingOperations
 * already threads through for the pre-existing castSpell op.
 */
export async function applyResolveActionOperations(
  characterId: string,
  operations: ResolveActionOperation[],
  casterUserId: string,
): Promise<void> {
  await runCharacterTransaction(characterId, operations, {
    select: { id: true },
    notFound: (id) => new InvalidResolveActionOperationError(`Character not found: ${id}`),
    applyOp: async ({ tx, op, characterId: id, batchId, sessionId }) => {
      const { before, after } = await payActionCostAndSideEffectsInTx(tx, id, batchId, sessionId, casterUserId, op);

      await recordSpellCastForOp(tx, sessionId, id, op);

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
          // Always an array (never undefined) so the feed never has to
          // distinguish "no riders" from "old event predates riders" (#1843).
          riders: op.riders ?? [],
          slotLevel: op.slotLevel ?? null,
          // The spellcasting entry this resolution cast, when it's a spell
          // (#1833) — audit-trail provenance only; the feed doesn't need it
          // to render (source/toHit/save/effect/riders already say what
          // happened), and undo doesn't read it either (the concentration/
          // buff/apply side effects it triggered already logged their own
          // events with their own before/after under this same batch).
          entryId: op.entryId ?? null,
        },
        batchId,
        sessionId,
      });
    },
  });
}

export { InvalidSpellcastingOperationError };
