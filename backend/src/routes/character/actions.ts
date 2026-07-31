/**
 * Actions routes
 *
 * POST /api/characters/:id/actions/transactions
 *   Phase-C orchestrator: applies a batch of action ops cross-domain in
 *   one Prisma $transaction (shared batchId → atomic, LIFO-undoable).
 *   Each op's effect list comes from ACTION_EFFECT_FN (hardcoded TS, not
 *   interpreted JSON) so no scripting engine lives in the DB — EXCEPT a
 *   row-driven action (#1528: a ClassFeature row with `activationCost` set,
 *   e.g. Fighter's Second Wind/Action Surge), which is dispatched from that
 *   row's own resource/cost/effect columns instead of a hardcoded key. This
 *   is not an interpreted engine either — it's the same "flat columns → one
 *   of a few enumerated shapes" adapter readAbilityCost/readEffectSpec
 *   already are, just resolved through a DB row instead of a TS closure.
 *
 *   For ops that have zero server-side effects (Dodge, Dash, etc.) the
 *   endpoint returns 200 with the current character state unchanged — the
 *   caller's economy-slot bookkeeping is purely client-ephemeral.
 *
 * The action catalog is consumed client-side via features/session/actionResolvers,
 * so there is no DB-backed GET /api/actions endpoint.
 */

import { randomUUID } from "node:crypto";

import { executeActionOpSchema, type ExecuteActionOperation } from "@character-sheet/contracts";
import type { ExecuteActionResult } from "@character-sheet/shared-types";
import { Router } from "express";
import { z } from "zod";

import { assertCharacterAccess } from "@/lib/auth/access.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ACTION_EFFECT_FN, castSpecFromRow, rageMeleeDamageBonus, UnknownActionError } from "@/lib/classes/actions.js";
import { castAbilityInTx } from "@/lib/spellcasting/ability-cast.js";
import type { PayCostContext } from "@/lib/spellcasting/ability-cost.js";
import type { SpendResourceOperation } from "@/lib/classes/resources.js";
import type { AdjustQuantityOperation } from "@/lib/inventory/inventory.js";
import { applyAdjustQuantity } from "@/lib/inventory/inventory.js";
import { applyHealInTx, applyTempHpInTx } from "@/lib/combat/hitpoints.js";
import { applySpendResourceInTx } from "@/lib/classes/resources.js";
import { deriveMartialArtsDie } from "@/lib/srd/srd.js";
import { editionOf } from "@/lib/rules/edition.js";
import { rollDie } from "@/lib/core/dice.js";
import { appendActiveBuffInTx, clearBuffByKeyInTx } from "@/lib/combat/active-effects.js";
import { normalizeSpellcastingMutable } from "@/lib/spellcasting/spell-state.js";
import { getActiveSessionId } from "@/lib/session/sessions.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";
import { levelForExperience } from "@/lib/leveling/experience.js";
import { effectiveEntryLevel } from "@/lib/leveling/effective-levels.js";
import { FEATURE_ROWS_ENTRY_SELECT, featureRowsOf } from "@/lib/classes/feature-rows-select.js";
import type { ClassFeatureRow } from "@/lib/classes/class-feature-rows.js";

export const actionsRouter = Router({ mergeParams: true });

const actionTransactionsSchema = z.object({
  operations: z.array(executeActionOpSchema).min(1),
});

// ExecuteActionResult (#1528) now lives in @character-sheet/shared-types —
// was a hand-written duplicate of frontend/src/types/character/actions.ts'
// own copy (#1369/#1370's exact failure mode), caught in review.

// Every class entry's own row-driven action rows (activationCost set), at
// that entry's own effective level — the ONE place a row-driven actionKey
// resolves to its ClassFeature row, shared by assertKnownActionKeys (the
// pre-transaction 400 gate) and applyRowDrivenActionInTx (the dispatcher), so
// the two can never independently disagree on which keys are legal.
const ROW_ACTION_SELECT = {
  experiencePoints: true,
  rulesEdition: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    select: { name: true, subclass: true, level: true, ...FEATURE_ROWS_ENTRY_SELECT },
  },
} satisfies Prisma.CharacterSelect;

type RowActionCharacter = Prisma.CharacterGetPayload<{ select: typeof ROW_ACTION_SELECT }>;

// Every row-driven action row available to this character right now — each
// class entry's classRows + subclassRows, filtered to activation rows
// (`activationCost` set), the right edition, and reached (row.level <=
// that entry's own effective level). Mirrors deriveEntryScopedActions'
// per-entry gate exactly, so the wire's `availableActions[]` and this
// dispatcher's legality check can never drift.
function eligibleRowActions(character: RowActionCharacter): ClassFeatureRow[] {
  const totalLevel = levelForExperience(character.experiencePoints);
  const edition = editionOf(character);
  const rows: ClassFeatureRow[] = [];
  for (const entry of character.classEntries) {
    const effLevel = effectiveEntryLevel(entry.level, character.classEntries.length, totalLevel);
    const { classRows, subclassRows } = featureRowsOf(entry);
    for (const row of [...classRows, ...subclassRows]) {
      if (row.activationCost && row.edition === edition && row.level <= effLevel) rows.push(row);
    }
  }
  return rows;
}

/**
 * Apply a single action op inside the shared transaction. `ACTION_EFFECT_FN`
 * yields a list of primitive ops (spend / adjust / heal / tempHp / buff)
 * applied in order; an actionKey it doesn't recognize falls through to the
 * row-driven dispatcher (#1528) — a ClassFeature row with `activationCost`
 * set, resolved by `eligibleRowActions` above. Split out of the
 * /transactions handler so the route stays a thin parse → validate →
 * transaction → serialize shell.
 */
async function applyActionOpInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: ExecuteActionOperation,
  batchId: string,
  sessionId: string | null,
  rageDamageBonus: number,
  heightenedFocusTempHp: number,
): Promise<ExecuteActionResult> {
  const effectFn = ACTION_EFFECT_FN[op.actionKey];
  if (!effectFn) {
    return applyRowDrivenActionInTx(tx, characterId, op, batchId, sessionId);
  }

  const ctx = { roll: op.roll, inventoryItemId: op.inventoryItemId, rageDamageBonus, heightenedFocusTempHp };
  const ops = effectFn(ctx);
  for (const effect of ops) {
    await applyActionEffectInTx(tx, characterId, effect, batchId, sessionId);
  }
  return {};
}

/**
 * Row-driven dispatch (#1528) — the retired `ACTION_CAST_FN`/DERIVED_ACTIONS
 * counterpart for a ClassFeature row. A row with no `effectKind` (Action
 * Surge — a pure counter) just spends its pool; a row WITH one (Second Wind)
 * routes through `castAbilityInTx`, but unlike the retired table, THIS
 * function rolls the effect itself — `castManeuver` (maneuvers.ts) is the
 * server-authoritative-roll precedent. The OpOutcome is intentionally not
 * logged for the cast-core path — byte-parity keeps only the spend + heal
 * events, same as before #1528.
 */
async function applyRowDrivenActionInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: ExecuteActionOperation,
  batchId: string,
  sessionId: string | null,
): Promise<ExecuteActionResult> {
  const character = await tx.character.findUnique({ where: { id: characterId }, select: ROW_ACTION_SELECT });
  if (!character) throw new Error(`Character not found: ${characterId}`);

  const row = eligibleRowActions(character).find((r) => r.resourceKey === op.actionKey);
  if (!row || !row.resourceKey) {
    throw new UnknownActionError(`Unknown action key: ${op.actionKey}`);
  }

  if (!row.effectKind) {
    // A pure counter (Action Surge) — the extra-action grant is client-side.
    await applySpendResourceInTx(
      tx,
      characterId,
      { type: "spendResource", key: row.resourceKey },
      batchId,
      sessionId,
    );
    return {};
  }

  const totalLevel = levelForExperience(character.experiencePoints);
  const { spec, roll } = castSpecFromRow(row, totalLevel, rollDie);

  const cRow = await tx.character.findUnique({ where: { id: characterId }, select: { spellcasting: true } });
  if (!cRow) throw new Error(`Character not found: ${characterId}`);
  const costCtx: PayCostContext = { tx, characterId, batchId, sessionId };
  await castAbilityInTx(
    { tx, characterId, batchId, sessionId, cost: costCtx, concentrationHost: normalizeSpellcastingMutable(cRow.spellcasting) },
    {
      name: spec.name,
      entryId: op.actionKey,
      cost: spec.cost,
      effect: spec.effect,
      roll,
      eventType: "castSpell", // discarded — see castAbilityInTx's own OpOutcome note
      concentrates: false,
      apply: spec.apply,
    },
  );
  return { roll };
}

/** The primitive op types `ACTION_EFFECT_FN` yields for a non-cast action. */
type ActionEffect = ReturnType<(typeof ACTION_EFFECT_FN)[string]>[number];

/** Apply one primitive action effect (spend / adjust / heal / tempHp / buff) in the tx. */
async function applyActionEffectInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  effect: ActionEffect,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  switch (effect.type) {
    case "spendResource":
      // Cast: SpendResourceOp is a structural subset of SpendResourceOperation
      // (omits optional `roll`). Safe because applySpendResourceInTx treats
      // roll as optional and defaults to undefined.
      await applySpendResourceInTx(
        tx, characterId, effect as SpendResourceOperation, batchId, sessionId
      );
      break;

    case "adjustQuantity":
      // Cast: AdjustQuantityOp is structurally identical to AdjustQuantityOperation.
      await applyAdjustQuantity(
        tx, characterId, effect as AdjustQuantityOperation, batchId, sessionId
      );
      break;

    case "heal":
      await applyHealInTx(tx, characterId, effect.amount, batchId, sessionId);
      break;

    case "tempHp":
      await applyTempHpInTx(tx, characterId, effect.amount, batchId, sessionId);
      break;

    case "applyBuff":
      await appendActiveBuffInTx(tx, characterId, effect.buff, batchId, sessionId);
      break;

    case "clearBuff":
      await clearBuffByKeyInTx(tx, characterId, effect.key, batchId, sessionId, effect.reason);
      break;

    default: {
      // Exhaustive — ACTION_EFFECT_FN returns the six op types above.
      const _never: never = effect;
      throw new Error(`Unexpected op type in action effect: ${JSON.stringify(_never)}`);
    }
  }
}

/**
 * Fail fast (400) on an op whose actionKey isn't in ACTION_EFFECT_FN or a
 * row-driven action currently available to this character (#1528) — reuses
 * `eligibleRowActions`, the SAME gate `applyRowDrivenActionInTx` dispatches
 * through, so a key this rejects can never be one the dispatcher would have
 * accepted (or vice versa).
 */
async function assertKnownActionKeys(operations: ExecuteActionOperation[], characterId: string): Promise<void> {
  const character = await prisma.character.findUnique({ where: { id: characterId }, select: ROW_ACTION_SELECT });
  const rowKeys = new Set(
    (character ? eligibleRowActions(character) : []).map((r) => r.resourceKey).filter((k): k is string => k !== undefined && k !== null),
  );
  for (const op of operations) {
    if (!ACTION_EFFECT_FN[op.actionKey] && !rowKeys.has(op.actionKey)) {
      throw new UnknownActionError(`Unknown action key: ${op.actionKey}`);
    }
  }
}

/**
 * Level-derived Rage melee bonus, resolved before the transaction so the rage
 * effect fn stays pure (no DB). Only hits the DB when a rage op is present.
 */
async function computeRageDamageBonus(operations: ExecuteActionOperation[], characterId: string): Promise<number> {
  if (!operations.some((op) => op.actionKey === "rage")) return 0;
  const classRow = await prisma.character.findUnique({
    where: { id: characterId },
    select: { classEntries: { select: { name: true, level: true } } },
  });
  const barbarianLevel = classRow?.classEntries.find((e) => e.name.toLowerCase() === "barbarian")?.level ?? 0;
  return rageMeleeDamageBonus(barbarianLevel);
}

/**
 * Heightened Focus (monk L10, PHB'24 p.98/SRD 5.2, #1244): Patient Defense's
 * Focus variant additionally grants temp HP = two Martial Arts die rolls,
 * rolled server-side (no client input) — mirrors computeRageDamageBonus:
 * only hits the DB when a patientDefenseFocus op is present, and only rolls
 * when the monk is actually L10+ (0 below that, so the effect fn omits the
 * tempHp op entirely rather than granting a zero amount).
 */
async function computeHeightenedFocusTempHp(operations: ExecuteActionOperation[], characterId: string): Promise<number> {
  if (!operations.some((op) => op.actionKey === "patientDefenseFocus")) return 0;
  const classRow = await prisma.character.findUnique({
    where: { id: characterId },
    select: { classEntries: { select: { name: true, level: true } }, rulesEdition: true },
  });
  if (!classRow) return 0;
  const monkLevel = classRow.classEntries.find((e) => e.name.toLowerCase() === "monk")?.level ?? 0;
  if (monkLevel < 10) return 0;
  const dieFaces = deriveMartialArtsDie(monkLevel, editionOf(classRow));
  return rollDie(dieFaces) + rollDie(dieFaces);
}

actionsRouter.post<{ id: string }>(
  "/transactions",
  async (req, res) => {
    const { id: characterId } = req.params;

    // Ownership chokepoint — 403 non-owner, 404 missing — before any work.
    await assertCharacterAccess(prisma, req.user!.id, characterId, "edit");

    const parsed = actionTransactionsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { operations } = parsed.data;

    // Fail fast on unknown keys BEFORE any DB work. Every domain error the ops
    // throw (UnknownActionError, Invalid{HitPoint,Resource,Inventory,Spellcasting}-
    // OperationError) carries an explicit `status`, so an op-validation failure
    // flows to the central `errorHandler` as its 400 and an unexpected throw as a
    // clean 500 — no message-string sniffing, no hand-rolled 500 here.
    await assertKnownActionKeys(operations, characterId);

    const rageDamageBonus = await computeRageDamageBonus(operations, characterId);
    const heightenedFocusTempHp = await computeHeightenedFocusTempHp(operations, characterId);
    const batchId = randomUUID();
    const sessionId = await getActiveSessionId(characterId);

    // Cross-domain atomic transaction — every op (cast-core, spendResource,
    // adjustQuantity, heal, tempHp) shares the same batchId so they appear as
    // one batch on the activity timeline and a single revertBatch undoes them all.
    // `results` is index-aligned 1:1 with `operations` (mirrors
    // applyManeuverOperations) so the client can fold a row-driven roll into
    // its dice animation without re-deriving the number (#1528).
    const results: ExecuteActionResult[] = [];
    await prisma.$transaction(async (tx) => {
      for (const op of operations) {
        results.push(await applyActionOpInTx(tx, characterId, op, batchId, sessionId, rageDamageBonus, heightenedFocusTempHp));
      }
    });

    // Return the full updated character, same as every other transaction endpoint.
    const row = await prisma.character.findUnique({
      where: { id: characterId },
      include: characterInclude,
    });
    if (!row) {
      res.status(404).json({ error: "Character not found after transaction" });
      return;
    }

    // batchId is additive alongside the serialized character so the client
    // can revert this exact batch on turn undo (#758); `results` is the
    // #1528 wire-contract addition (was `Promise<void>`/no per-op result).
    res.json({ ...serializeCharacter(row), batchId, results });
  }
);
