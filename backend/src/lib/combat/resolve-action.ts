/**
 * resolveAction transaction handler (#1829) — a weapon swing or spell cast persists as ONE undoable
 * `CharacterEvent` whose `data` carries the rolls, instead of separate attackRoll/damageRoll/castSpell
 * rows. Standalone check/save/initiative/tally rolls also commit here via the `logRoll` op arm (#1861);
 * the `castSpell` op remains for pre-#1833 callers.
 *
 * The only state delta this handles is a leveled spell's slot spend (`slotLevel` on the op), paid
 * through the same `loadSlotPayContext` + `payAbilityCostInTx` preamble `castSpell`/`castAbilityWithSlotInTx`
 * use, so slot-table derivation, Mystic Arcanum fallback, and the "no slots remaining" guard are each the
 * ONE shared implementation. A cantrip or weapon resolution (`slotLevel` omitted) has no server-side state
 * to spend — the event is still written, with no before/after snapshot, so it is still LIFO-revertible
 * (nothing to restore, but the batch is still markable reverted). A row-driven RESOURCE cost is deliberately
 * out of scope here.
 */

import { Prisma, type SpellCastKind } from "@/generated/prisma/client.js";
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
import { assassinateEligible } from "@/lib/classes/assassinate.js";
import { editionOf } from "@/lib/rules/edition.js";
import {
  resolveActionRequestOperationSchema,
  type ResolveActionOperation,
  type ResolveActionRequestOperation,
} from "./resolve-action-ops.js";
import { writeStandaloneRollEvent } from "./standalone-roll-op.js";
import type { CastSpellOperation } from "@character-sheet/shared-types";

const RESOLVE_ACTION_SELECT = {
  id: true,
  rulesEdition: true,
  classEntries: {
    select: { name: true, level: true, subclass: true, subclassRef: { select: { slug: true } } },
  },
} satisfies Prisma.CharacterSelect;

type ResolveActionRow = Prisma.CharacterGetPayload<{ select: typeof RESOLVE_ACTION_SELECT }>;

export { resolveActionRequestOperationSchema, type ResolveActionRequestOperation };

// status → the 400 the central `errorHandler` maps (client op-validation error).
export class InvalidResolveActionOperationError extends Error {
  status = 400;
}

// Assassinate's eligibility gate (#1526): the character row is already
// widened to carry classEntries/rulesEdition for this, so the check costs no
// extra query. Self-or-announce still means the server never computes the
// crit itself — it only gates WHO may assert one via this flag.
function assertAssassinateEligible(row: ResolveActionRow, op: ResolveActionOperation): void {
  if (!op.assassinate) return;
  if (!assassinateEligible(row.classEntries, editionOf(row))) {
    throw new InvalidResolveActionOperationError("Only a 2014 Assassin at class level 3+ may declare Assassinate");
  }
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
  // castAbilityWithSlotInTx — own not-found error kept (400 domain error
  // here vs that caller's 5xx internal invariant).
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
  // place, not re-implemented here. Mutates state.slotsUsed/arcanumUsed in
  // place (same aliasing costCtx sets up).
  await payAbilityCostInTx(costCtx, { kind: "slot", minLevel: op.slotLevel }, op.slotLevel, ABILITY_SLOT_SUBJECT);

  const after = snapshotSpellcasting(state);
  await tx.character.update({
    where: { id: characterId },
    data: { spellcasting: after.spellcasting as unknown as Prisma.InputJsonValue },
  });

  return { before, after };
}

// The universal cost + side-effects router for BOTH branches a resolveAction op can take: a weapon
// or cantrip-with-no-entryId op (`op.entryId == null`) delegates to payResolveActionCost's bare
// slot-spend; an entryId-bearing spell op (#1833) routes slotLevel/apply through the SAME
// castAbilityInTx sequence castSpell uses (castSpellForResolutionInTx), so concentration, a buff
// spell's self-buff, and a self/ally heal/damage apply all still happen. `roll` feeds
// castAbilityInTx's own eventData/apply-amount plumbing; the resolveAction event logged by the
// caller carries the rail data (toHit/save/effect/riders) separately.
//
// ONLY the spell branch builds a TurnSpellCast record for the per-turn interlock (#1439) — coupled
// to the spell resolution actually running, never to entryId presence alone. `kind` is leveled iff a
// slot was spent (a cantrip has no slotLevel).
interface TurnSpellCast {
  economy: "action" | "bonus" | "reaction";
  kind: SpellCastKind;
}

type PayResult = {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  spellCast: TurnSpellCast | null;
};

async function payActionCostAndSideEffectsInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  batchId: string,
  sessionId: string | null,
  casterUserId: string,
  op: ResolveActionOperation,
): Promise<PayResult> {
  if (op.entryId == null) {
    const { before, after } = await payResolveActionCost(tx, characterId, batchId, sessionId, op);
    return { before, after, spellCast: null };
  }
  const castOp: CastSpellOperation = {
    type: "castSpell",
    entryId: op.entryId,
    ...(op.slotLevel !== undefined ? { slotLevel: op.slotLevel } : {}),
    roll: op.effect?.total ?? 0,
    ...(op.apply ? { apply: op.apply } : {}),
  };
  // Reaching here means the op declared a spell (entryId); castSpellForResolutionInTx
  // then VALIDATES the entry exists (throws InvalidSpellcastingOperationError
  // otherwise), so a weapon op with a spurious entryId aborts the whole
  // transaction before any interlock write. Only a genuine, resolved spell cast
  // yields a spellCast record.
  const { before, after } = await castSpellForResolutionInTx(
    tx,
    characterId,
    batchId,
    sessionId,
    casterUserId,
    castOp,
  );
  return {
    before,
    after,
    spellCast: { economy: op.cost.kind, kind: op.slotLevel != null ? "leveled" : "cantrip" },
  };
}

// Records the per-turn spell-cast kind for the 5e bonus-action interlock (#1439) — no-op unless a
// spell actually resolved and the character is in a session. recordTurnSpellCast is itself a further
// no-op when the session's combat is inactive (session.combatActive, #1875).
async function recordSpellCastForOp(
  tx: Prisma.TransactionClient,
  sessionId: string | null,
  characterId: string,
  spellCast: TurnSpellCast | null,
): Promise<void> {
  if (spellCast == null || sessionId == null) return;
  await recordTurnSpellCast(tx, sessionId, characterId, spellCast.economy, spellCast.kind);
}

function summaryFor(op: ResolveActionOperation): string {
  const costWord = op.cost.attacks && op.cost.attacks > 1 ? `${op.cost.attacks} attacks` : op.cost.kind;
  const instanceWord = op.instances && op.instances.length > 1 ? `, ${op.instances.length} instances` : "";
  return `Resolved ${op.source} (${costWord}${instanceWord})`;
}

// Pulled out of applyOp below so its own field-by-field null-coalescing doesn't inflate the
// transaction closure's complexity — every field here mirrors the op verbatim except for the
// always-an-array/always-a-boolean normalizations noted per field.
function resolveActionEventData(op: ResolveActionOperation): Record<string, unknown> {
  return {
    actionId: op.actionId,
    source: op.source,
    cost: op.cost,
    toHit: op.toHit ?? null,
    save: op.save ?? null,
    effect: op.effect ?? null,
    // Always an array (never undefined) so the feed never has to
    // distinguish "no riders" from "old event predates riders" (#1843).
    riders: op.riders ?? [],
    // Multi-instance roll set (#1981/#1982) — always an array (never
    // undefined), same convention as riders above. Mutually exclusive
    // with toHit/effect at the op schema, so this is empty whenever
    // those are set and vice versa.
    instances: op.instances ?? [],
    slotLevel: op.slotLevel ?? null,
    // The spellcasting entry this resolution cast, when it's a spell
    // (#1833) — audit-trail provenance only; the feed doesn't need it
    // to render (source/toHit/save/effect/riders already say what
    // happened), and undo doesn't read it either (the concentration/
    // buff/apply side effects it triggered already logged their own
    // events with their own before/after under this same batch).
    entryId: op.entryId ?? null,
    // 2014 Assassinate attribution (#1526) — always a boolean (never
    // undefined) so the feed can distinguish "not Assassinate" from
    // "old event predates this field", same convention as `riders`.
    assassinate: op.assassinate ?? false,
  };
}

/**
 * Applies a batch of resolveAction operations atomically. Mirrors
 * applySpellcastingOperations/applyHitPointOperations: one batchId, one $transaction, one
 * CharacterEvent per op (category "combat", type "resolveAction").
 *
 * `casterUserId` (#1833) is the authenticated caller — required to route a spell's self/ally heal
 * apply (party-target healing #462 needs it to check campaign membership).
 */
export async function applyResolveActionOperations(
  characterId: string,
  operations: ResolveActionRequestOperation[],
  casterUserId: string,
): Promise<string> {
  return runCharacterTransaction(characterId, operations, {
    select: RESOLVE_ACTION_SELECT,
    notFound: (id) => new InvalidResolveActionOperationError(`Character not found: ${id}`),
    applyOp: async ({ tx, row, op, characterId: id, batchId, sessionId }) => {
      // Standalone player roll (#1861): a check/save/initiative or tally-damage
      // roll — no combat cost/side-effects, just its own roll-category event.
      if (op.type === "logRoll") {
        await writeStandaloneRollEvent(tx, id, batchId, sessionId, op);
        return;
      }

      assertAssassinateEligible(row, op);

      const { before, after, spellCast } = await payActionCostAndSideEffectsInTx(tx, id, batchId, sessionId, casterUserId, op);

      await recordSpellCastForOp(tx, sessionId, id, spellCast);

      await logEvent(tx, {
        characterId: id,
        category: "combat",
        type: "resolveAction",
        summary: summaryFor(op),
        before,
        after,
        data: resolveActionEventData(op),
        batchId,
        sessionId,
      });
    },
  });
}

export { InvalidSpellcastingOperationError };
