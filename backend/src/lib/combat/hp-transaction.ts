import { Prisma } from "@/generated/prisma/client.js";
import {
  clearBuffsForRestInTx,
  clearWhileActiveBuffsInTx,
} from "./active-effects.js";
import { logEvent } from "@/lib/activity/events.js";
import { resetActivatedUsesForRestInTx } from "@/lib/inventory/item-recharge.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import { InvalidHitPointOperationError, type HitPoints, type HitDice } from "./hp-core.js";
import type {
  ConcentrationSaveOperation,
  HitPointOperation,
  LevelUpOperation,
} from "./hp-operations.js";
import { buildHpOpContext, type HpOpContext, type HpOpResult } from "./hp-context.js";
import {
  applyDamageOp,
  applyDeathSaveOp,
  applyHealOp,
  applyLevelUpOp,
  applySetTempOp,
  applyStabilizeOp,
} from "./hp-ops.js";
import { applyShortRestOp, applyLongRestOp } from "./rest.js";
import {
  applyConcentrationCheckInTx,
  applyConcentrationSaveInTx,
  type ConcentrationCheckResult,
} from "./concentration.js";

// ---- Per-op phase helpers ----
// The applyHitPointOperations loop runs each op through five ordered phases:
// context build → dispatch → snapshot assembly → main-event emit → follow-on
// events. Each phase is a named helper below so the loop reads linearly; the
// phase ORDER is load-bearing (the main hitPoints event must land before any
// buff-clear / concentration follow-ups so the timeline and LIFO undo stay
// consistent).

/** Every HP op except the manual concentration save, which the loop resolves on its own. */
type HpStateOperation = Exclude<HitPointOperation, ConcentrationSaveOperation>;

/**
 * Phase 2: dispatch the op to its applier. Appliers mutate ctx.hp/ctx.hd in
 * place and return the summary/eventData for the loop to log — they never
 * call logEvent themselves (the loop is the sole emitter of the main event).
 */
async function dispatchHpOp(ctx: HpOpContext, op: HpStateOperation): Promise<HpOpResult> {
  switch (op.type) {
    case "damage":
      return applyDamageOp(ctx, op);

    case "heal":
      return applyHealOp(ctx, op);

    case "setTemp":
      return applySetTempOp(ctx, op);

    case "shortRest":
      return applyShortRestOp(ctx, op);

    case "longRest":
      return applyLongRestOp(ctx);

    case "levelUp":
      return applyLevelUpOp(ctx, op);

    case "deathSave":
      return applyDeathSaveOp(ctx, op);

    case "stabilize":
      return applyStabilizeOp(ctx);

    default: {
      const _exhaustive: never = op;
      throw new InvalidHitPointOperationError(`Unknown op type: ${(_exhaustive as { type: string }).type}`);
    }
  }
}

/** The mutable pair every snapshot lifter below appends to. */
interface HpOpSnapshots {
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
}

/**
 * levelUp: capture the class-entry level diff from the op result — it points
 * at the CHOSEN entry (or is null for a new-class add), not always position-0.
 */
function liftLevelUpSnapshot(snaps: HpOpSnapshots, eventData: Record<string, unknown>): void {
  snaps.beforeState.classEntryLevel = (eventData.prevEntryLevel as number | null) ?? null;
  snaps.afterState.classEntryLevel = (eventData.newEntryLevel as number | null) ?? null;
}

/**
 * longRest: spellcasting (so undo re-expends the slots), resources, and the
 * consumable recharge (#121) snapshots. The after-spellcasting reflects the
 * cleared state, preserving the known-spell list.
 */
function liftLongRestSnapshot(snaps: HpOpSnapshots, data: Record<string, unknown>): void {
  const beforeSpell = data.beforeSpellState as Record<string, unknown>;
  snaps.beforeState.spellcasting = beforeSpell;
  snaps.afterState.spellcasting = { slotsUsed: {}, arcanumUsed: {}, spells: beforeSpell?.spells ?? [], concentratingOn: null };
  delete data.beforeSpellState; // don't duplicate in eventData
  if (data.beforeResourceState !== undefined) {
    snaps.beforeState.resources = data.beforeResourceState;
    snaps.afterState.resources = data.afterResourceState ?? data.beforeResourceState;
    delete data.beforeResourceState;
    delete data.afterResourceState;
  }
  if (data.consumableChargesBefore !== undefined) {
    snaps.beforeState.consumableCharges = data.consumableChargesBefore;
    snaps.afterState.consumableCharges = data.consumableChargesAfter ?? data.consumableChargesBefore;
    delete data.consumableChargesBefore;
    delete data.consumableChargesAfter;
  }
}

/**
 * shortRest: resources land in `before` ONLY (there is deliberately no
 * after.resources key — undo restores from before), plus the Warlock Pact
 * restore when present; a short rest preserves arcanum and concentration.
 */
function liftShortRestSnapshot(snaps: HpOpSnapshots, data: Record<string, unknown>): void {
  if (data.beforeResourceState !== undefined) {
    snaps.beforeState.resources = data.beforeResourceState;
    delete data.beforeResourceState;
  }
  if (data.beforeSpellState !== undefined) {
    const beforeSpell = data.beforeSpellState as Record<string, unknown>;
    snaps.beforeState.spellcasting = beforeSpell;
    snaps.afterState.spellcasting = {
      slotsUsed: {},
      arcanumUsed: beforeSpell?.arcanumUsed ?? {},
      spells: beforeSpell?.spells ?? [],
      concentratingOn: beforeSpell?.concentratingOn ?? null,
    };
    delete data.beforeSpellState;
  }
}

/**
 * Item charge-pool recharge (#555) — either rest can fire it (short-trigger
 * pools recharge on short rests too); snapshot so undo re-expends the pool.
 */
function liftChargePoolSnapshot(snaps: HpOpSnapshots, data: Record<string, unknown>): void {
  if (data.chargePoolsBefore !== undefined) {
    snaps.beforeState.chargePools = data.chargePoolsBefore;
    snaps.afterState.chargePools = data.chargePoolsAfter ?? data.chargePoolsBefore;
    delete data.chargePoolsBefore;
    delete data.chargePoolsAfter;
  }
}

/**
 * Phase 3: assemble the before/after sub-state snapshots for the event by
 * running the per-op snapshot lifters above. Each lifter that touches a rest/
 * level snapshot (see liftLevelUpSnapshot / liftLongRestSnapshot /
 * liftShortRestSnapshot / liftChargePoolSnapshot) lifts its keys OUT of
 * eventData into before/after rather than duplicating them in the data payload.
 *
 * @param eventData MUTATED: rest/level snapshot keys (beforeSpellState,
 *   beforeResourceState, chargePoolsBefore, consumableChargesBefore, …) are
 *   lifted into before/after and `delete`d here, so on return `eventData` holds
 *   only the fields that belong in the event's `data` payload.
 */
function buildHpOpSnapshots(
  ctx: HpOpContext,
  op: HpStateOperation,
  beforeHp: HitPoints,
  beforeHd: HitDice,
  eventData: Record<string, unknown>,
): { beforeState: Record<string, unknown>; afterState: Record<string, unknown> } {
  const { hp, hd } = ctx;
  const snaps: HpOpSnapshots = {
    beforeState: { hitPoints: beforeHp, hitDice: beforeHd },
    afterState: { hitPoints: { ...hp }, hitDice: { ...hd } },
  };
  if (op.type === "levelUp") liftLevelUpSnapshot(snaps, eventData);
  if (op.type === "longRest") liftLongRestSnapshot(snaps, eventData);
  if (op.type === "shortRest" || op.type === "longRest") liftChargePoolSnapshot(snaps, eventData);
  if (op.type === "shortRest") liftShortRestSnapshot(snaps, eventData);
  return snaps;
}

/**
 * Phase 4: emit the main hitPoints event. This is the SOLE emitter for the op
 * itself; any follow-on events (buff clears, concentration) come after it.
 */
async function logHpOpEvent(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: HpStateOperation,
  result: HpOpResult,
  beforeState: Record<string, unknown>,
  afterState: Record<string, unknown>,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  await logEvent(tx, {
    characterId,
    category: "hitPoints",
    type: op.type,
    summary: result.summary,
    before: beforeState,
    after: afterState,
    data: result.eventData,
    batchId,
    sessionId,
  });
}

/**
 * Phase 5: follow-on events, in fixed order after the main event: rest
 * buff-clears + activated-use resets, then while-active buff clears, then the
 * damage-triggered concentration check. Returns the concentration check (if
 * one ran) so the route can surface the auto-rolled CON save to the player.
 */
// fallow-ignore-next-line complexity
async function applyHpOpFollowOns(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: HpStateOperation,
  hp: HitPoints,
  damageForConcentration: number | null,
  batchId: string,
  sessionId: string | null,
): Promise<ConcentrationCheckResult | null> {
  // A rest clears its matching "until-rest" durable buffs (#455). Long rest
  // clears both short- and long-rest buffs; short rest only short.
  if (op.type === "shortRest" || op.type === "longRest") {
    const rest = op.type === "longRest" ? "long" : "short";
    await clearBuffsForRestInTx(tx, characterId, rest, batchId, sessionId);
    // Recharge item activatedEffect uses on the matching rest (#543).
    await resetActivatedUsesForRestInTx(tx, characterId, rest, batchId, sessionId);
  }

  // A long rest or falling unconscious (0 HP) ends all "while-active" durable
  // self-buffs (e.g. Rage) — the turn-hook covers the "no attack/no damage" case.
  if (op.type === "longRest" || (op.type === "damage" && hp.current === 0)) {
    await clearWhileActiveBuffsInTx(
      tx,
      characterId,
      batchId,
      sessionId,
      op.type === "longRest" ? "long rest" : "unconscious",
    );
  }

  // After the damage event is logged, resolve concentration (issue #41).
  // Logged as a separate "spellcasting" event sharing this batchId so the
  // CON save shows on the timeline and LIFO undo reverses HP + concentration
  // together. `hp.current` here is the post-damage current HP.
  if (damageForConcentration !== null) {
    // `autoRollConcentration: false` (issue #76) defers the save: the check
    // returns a `pending` result and the client follows up with a
    // `concentrationSave` op. Omitted/true keeps today's server-side roll.
    const autoRoll = op.type === "damage" ? op.autoRollConcentration !== false : true;
    return applyConcentrationCheckInTx(
      tx,
      characterId,
      damageForConcentration,
      hp.current,
      batchId,
      sessionId,
      autoRoll,
    );
  }

  return null;
}

// ---- Transaction handler ----

/**
 * Applies a batch of HP operations atomically in one Prisma transaction.
 * State is re-read from the DB per op so a batch of N levelUp ops applies
 * sequentially (each sees the updated total/max/current from the previous).
 * Every meaningful op writes a CharacterEvent (with field-level diffs) in
 * the same transaction so history and state are always consistent.
 */
export async function applyHitPointOperations(
  characterId: string,
  operations: HitPointOperation[]
): Promise<{ concentrationChecks: ConcentrationCheckResult[] }> {
  // Collect concentration checks triggered by damage ops so the route can
  // surface the auto-rolled CON save(s); pushed to from applyOp below.
  const concentrationChecks: ConcentrationCheckResult[] = [];

  // The scaffold's per-op row is only the existence check: each op applier
  // re-reads its own state via buildHpOpContext (or the levelUp/concentration
  // seams) so the in-tx composition helpers stay composable under a caller tx.
  await runCharacterTransaction(characterId, operations, {
    select: { id: true },
    notFound: (id) => new InvalidHitPointOperationError(`Character not found: ${id}`),
    applyOp: async ({ tx, op, characterId: id, batchId, sessionId }) => {
      // A manual concentration save (issue #76) touches no HP — resolve it on
      // its own and skip the HP read/write-back below.
      if (op.type === "concentrationSave") {
        const check = await applyConcentrationSaveInTx(
          tx,
          id,
          op.entryId,
          op.roll,
          op.damage,
          batchId,
          sessionId,
        );
        if (check) concentrationChecks.push(check);
        return;
      }

      // levelUp shares its extracted seam with the unified endpoint (#895).
      if (op.type === "levelUp") {
        await applyLevelUpHpInTx(tx, id, op, batchId, sessionId);
        return;
      }

      // Phase 1: re-read state and build the per-op context.
      const ctx = await buildHpOpContext(tx, id);

      // Snapshot the sub-state before this op so the event can show both
      // before/after and the per-field diffs (ctx.beforeClassLevel covers the
      // class-entry level for levelUp).
      const beforeHp = { ...ctx.hp };
      const beforeHd = { ...ctx.hd };

      // Phase 2: apply the op (mutates ctx.hp/ctx.hd in place).
      const result = await dispatchHpOp(ctx, op);
      // For a damage op, a concentration check runs after the common HP
      // write-back below (it needs the post-damage current HP).
      const damageForConcentration = result.damageForConcentration ?? null;

      // Common write-back: every op persists hitPoints + hitDice.
      // fallow-ignore-next-line code-duplication
      await tx.character.update({
        where: { id },
        data: {
          hitPoints: ctx.hp as unknown as Prisma.InputJsonValue,
          hitDice: ctx.hd as unknown as Prisma.InputJsonValue,
        },
      });

      // Phase 3: assemble the event's before/after snapshots (lifts rest-op
      // snapshot keys out of result.eventData).
      const { beforeState, afterState } = buildHpOpSnapshots(ctx, op, beforeHp, beforeHd, result.eventData);

      // Phase 4: emit the main hitPoints event — always FIRST in the batch,
      // before any follow-on events.
      await logHpOpEvent(tx, id, op, result, beforeState, afterState, batchId, sessionId);

      // Phase 5: follow-on events (rest buff-clears + activated-use resets,
      // while-active clears, damage-triggered concentration check).
      const check = await applyHpOpFollowOns(
        tx,
        id,
        op,
        ctx.hp,
        damageForConcentration,
        batchId,
        sessionId,
      );
      if (check) concentrationChecks.push(check);
    },
  });

  return { concentrationChecks };
}

/**
 * Applies one level-up HP gain inside a caller-supplied transaction/batchId,
 * so the unified level-up endpoint (#885) can compose HP with other domains
 * under one batchId. Composes the same phases as the loop's levelUp path
 * (buildHpOpContext → snapshot → applyLevelUpOp → write-back → snapshots →
 * logHpOpEvent); levelUp has no phase-5 follow-ons, so this is byte-identical.
 * Emits the reversible `levelUp` event experience-ops.ts reads to auto-reverse.
 */
export async function applyLevelUpHpInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: LevelUpOperation,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  const ctx = await buildHpOpContext(tx, characterId);
  const beforeHp = { ...ctx.hp };
  const beforeHd = { ...ctx.hd };
  const result = await applyLevelUpOp(ctx, op);
  // fallow-ignore-next-line code-duplication
  await tx.character.update({
    where: { id: characterId },
    data: {
      hitPoints: ctx.hp as unknown as Prisma.InputJsonValue,
      hitDice: ctx.hd as unknown as Prisma.InputJsonValue,
    },
  });
  const { beforeState, afterState } = buildHpOpSnapshots(ctx, op, beforeHp, beforeHd, result.eventData);
  await logHpOpEvent(tx, characterId, op, result, beforeState, afterState, batchId, sessionId);
}
