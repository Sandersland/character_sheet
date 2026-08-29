import type {
  ConcentrationSaveOperation,
  HitPointOperation,
  LevelUpOperation,
} from "@character-sheet/contracts";

import { Prisma } from "@/generated/prisma/client.js";
import {
  clearBuffsForRestInTx,
  clearWhileActiveBuffsInTx,
} from "./buff-end.js";
import { logEvent } from "@/lib/activity/events.js";
import { resetActivatedUsesForRestInTx } from "@/lib/inventory/item-recharge.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import { InvalidHitPointOperationError, type HitPoints, type HitDice } from "./hp-core.js";
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

// The loop runs each op through five ordered phases (context build, dispatch, snapshot, main-event
// emit, follow-ons); phase ORDER is load-bearing — the main hitPoints event must land before any
// buff-clear/concentration follow-up so the timeline and LIFO undo stay consistent.
type HpStateOperation = Exclude<HitPointOperation, ConcentrationSaveOperation>;

// Appliers mutate ctx.hp/ctx.hd in place and return summary/eventData; they never call logEvent —
// the loop is the sole emitter of the main event.
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

interface HpOpSnapshots {
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
}

// Points at the CHOSEN entry (or is null for a new-class add), not always position-0.
function liftLevelUpSnapshot(snaps: HpOpSnapshots, eventData: Record<string, unknown>): void {
  snaps.beforeState.classEntryLevel = (eventData.prevEntryLevel as number | null) ?? null;
  snaps.afterState.classEntryLevel = (eventData.newEntryLevel as number | null) ?? null;
}

// Preserves the known-spell list in after-spellcasting even though slots/concentration are cleared,
// so undo re-expends the slots correctly.
function liftLongRestSnapshot(snaps: HpOpSnapshots, data: Record<string, unknown>): void {
  const beforeSpell = data.beforeSpellState as Record<string, unknown>;
  snaps.beforeState.spellcasting = beforeSpell;
  snaps.afterState.spellcasting = { slotsUsed: {}, arcanumUsed: {}, spells: beforeSpell?.spells ?? [], concentratingOn: null };
  delete data.beforeSpellState;
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
  // Exhaustion -1 recovery: lift into before/after so undo re-applies the cleared level (only
  // present when the character had exhaustion to recover).
  if (data.beforeConditionsState !== undefined) {
    snaps.beforeState.conditions = data.beforeConditionsState;
    snaps.afterState.conditions = data.afterConditionsState ?? data.beforeConditionsState;
    delete data.beforeConditionsState;
    delete data.afterConditionsState;
  }
}

// Resources land in `before` ONLY — there is deliberately no after.resources key; undo restores from before.
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

// Either rest can fire it (short-trigger pools recharge on short rests too); snapshot so undo re-expends the pool.
function liftChargePoolSnapshot(snaps: HpOpSnapshots, data: Record<string, unknown>): void {
  if (data.chargePoolsBefore !== undefined) {
    snaps.beforeState.chargePools = data.chargePoolsBefore;
    snaps.afterState.chargePools = data.chargePoolsAfter ?? data.chargePoolsBefore;
    delete data.chargePoolsBefore;
    delete data.chargePoolsAfter;
  }
}

// eventData is MUTATED: rest/level snapshot keys are lifted into before/after and deleted here, so on
// return eventData holds only the fields belonging in the event's data payload.
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

// Fixed order: rest buff-clears + activated-use resets, then while-active buff clears, then the
// damage-triggered concentration check.
// fallow-ignore-next-line complexity -- fixed-order follow-on phases; splitting would obscure the ordering contract
async function applyHpOpFollowOns(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: HpStateOperation,
  hp: HitPoints,
  damageForConcentration: number | null,
  batchId: string,
  sessionId: string | null,
): Promise<ConcentrationCheckResult | null> {
  // Long rest clears both short- and long-rest until-rest buffs; short rest clears only short.
  if (op.type === "shortRest" || op.type === "longRest") {
    const rest = op.type === "longRest" ? "long" : "short";
    await clearBuffsForRestInTx(tx, characterId, rest, batchId, sessionId);
    await resetActivatedUsesForRestInTx(tx, characterId, rest, batchId, sessionId);
  }

  // A condition suspended against a cleared buff is restored inside the clear itself, same as every buff-end path.
  if (op.type === "longRest" || (op.type === "damage" && hp.current === 0)) {
    await clearWhileActiveBuffsInTx(
      tx,
      characterId,
      batchId,
      sessionId,
      op.type === "longRest" ? "long rest" : "unconscious",
    );
  }

  // Shares this batchId so LIFO undo reverses HP + concentration together; hp.current here is the
  // post-damage current HP.
  if (damageForConcentration !== null) {
    // autoRollConcentration: false defers the save: the check returns a "pending" result and the
    // client follows up with a concentrationSave op. Omitted/true keeps the server-side roll.
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

// State is re-read from the DB per op so a batch of N ops applies sequentially, each seeing the
// previous op's updated total/max/current.
export async function applyHitPointOperations(
  characterId: string,
  operations: HitPointOperation[]
): Promise<{ concentrationChecks: ConcentrationCheckResult[] }> {
  const concentrationChecks: ConcentrationCheckResult[] = [];

  // The scaffold's per-op row is only the existence check: each op applier re-reads its own state via
  // buildHpOpContext (or the levelUp/concentration seams) so the in-tx composition helpers stay
  // composable under a caller tx.
  await runCharacterTransaction(characterId, operations, {
    select: { id: true },
    notFound: (id) => new InvalidHitPointOperationError(`Character not found: ${id}`),
    applyOp: async ({ tx, op, characterId: id, batchId, sessionId }) => {
      // A manual concentration save touches no HP — resolve it on its own and skip the HP read/write-back below.
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

      // levelUp shares its extracted seam with the unified endpoint.
      if (op.type === "levelUp") {
        await applyLevelUpHpInTx(tx, id, op, batchId, sessionId);
        return;
      }

      const ctx = await buildHpOpContext(tx, id);

      // ctx.beforeClassLevel covers the class-entry level diff for levelUp.
      const beforeHp = { ...ctx.hp };
      const beforeHd = { ...ctx.hd };

      const result = await dispatchHpOp(ctx, op);
      // For a damage op, a concentration check runs after the common HP write-back below (it needs
      // the post-damage current HP).
      const damageForConcentration = result.damageForConcentration ?? null;

      // fallow-ignore-next-line code-duplication -- shared hitPoints+hitDice write-back, intentionally identical across ops
      await tx.character.update({
        where: { id },
        data: {
          hitPoints: ctx.hp as unknown as Prisma.InputJsonValue,
          hitDice: ctx.hd as unknown as Prisma.InputJsonValue,
        },
      });

      const { beforeState, afterState } = buildHpOpSnapshots(ctx, op, beforeHp, beforeHd, result.eventData);

      await logHpOpEvent(tx, id, op, result, beforeState, afterState, batchId, sessionId);

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

// Composes the same phases as the loop's levelUp path (no phase-5 follow-ons, so this is
// byte-identical). Emits the reversible levelUp event the XP-lowering auto-reverse path reads.
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
  // fallow-ignore-next-line code-duplication -- same intentional hitPoints+hitDice write-back as the main op path
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
