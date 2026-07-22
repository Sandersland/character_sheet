/**
 * Actions routes
 *
 * POST /api/characters/:id/actions/transactions
 *   Phase-C orchestrator: applies a batch of action ops cross-domain in
 *   one Prisma $transaction (shared batchId → atomic, LIFO-undoable).
 *   Each op's effect list comes from ACTION_EFFECT_FN (hardcoded TS, not
 *   interpreted JSON) so no scripting engine lives in the DB.
 *
 *   For ops that have zero server-side effects (Dodge, Dash, etc.) the
 *   endpoint returns 200 with the current character state unchanged — the
 *   caller's economy-slot bookkeeping is purely client-ephemeral.
 *
 * The action catalog is consumed client-side via features/session/actionResolvers,
 * so there is no DB-backed GET /api/actions endpoint.
 */

import { randomUUID } from "node:crypto";

import { Router } from "express";
import { z } from "zod";

import { assertCharacterAccess } from "@/lib/auth/access.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ACTION_EFFECT_FN, ACTION_CAST_FN, rageMeleeDamageBonus, UnknownActionError } from "@/lib/classes/actions.js";
import { castAbilityInTx } from "@/lib/spellcasting/ability-cast.js";
import type { PayCostContext } from "@/lib/spellcasting/ability-cost.js";
import type { SpendResourceOperation } from "@/lib/classes/resources.js";
import type { AdjustQuantityOperation } from "@/lib/inventory/inventory.js";
import { applyAdjustQuantity } from "@/lib/inventory/inventory.js";
import { applyHealInTx, applyTempHpInTx } from "@/lib/combat/hitpoints.js";
import { applySpendResourceInTx } from "@/lib/classes/resources.js";
import { deriveMartialArtsDie } from "@/lib/srd/srd.js";
import { rollDie } from "@/lib/core/dice.js";
import { appendActiveBuffInTx, clearBuffByKeyInTx } from "@/lib/combat/active-effects.js";
import { normalizeSpellcastingMutable } from "@/lib/spellcasting/spell-state.js";
import { getActiveSessionId } from "@/lib/session/sessions.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";

export const actionsRouter = Router({ mergeParams: true });

const executeActionSchema = z.object({
  type: z.literal("executeAction"),
  actionKey: z.string().min(1),
  /** Client-supplied roll total (potion healing, Second Wind heal, etc.). */
  roll: z.number().int().positive().optional(),
  /** Inventory item to consume (for "drink potion" / Use Object). */
  inventoryItemId: z.string().optional(),
});

const actionTransactionsSchema = z.object({
  operations: z.array(executeActionSchema).min(1),
});

type ExecuteActionOp = z.infer<typeof executeActionSchema>;

/**
 * Apply a single action op inside the shared transaction. A cast-core action
 * (`ACTION_CAST_FN`) pays its pool cost + self-applies through the shared caster;
 * otherwise `ACTION_EFFECT_FN` yields a list of primitive ops (spend / adjust /
 * heal / tempHp / buff) applied in order. Split out of the /transactions
 * handler so the route stays a thin parse → validate → transaction →
 * serialize shell.
 */
async function applyActionOpInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: ExecuteActionOp,
  batchId: string,
  sessionId: string | null,
  rageDamageBonus: number,
  heightenedFocusTempHp: number,
): Promise<void> {
  const ctx = { roll: op.roll, inventoryItemId: op.inventoryItemId, rageDamageBonus, heightenedFocusTempHp };

  // Cast-core actions (Second Wind #420): pay the pool cost + self-apply the
  // heal through the shared caster. The OpOutcome is intentionally not logged —
  // byte-parity keeps only the spend + heal events.
  const castFn = ACTION_CAST_FN[op.actionKey];
  if (castFn) {
    const spec = castFn(ctx);
    const cRow = await tx.character.findUnique({
      where: { id: characterId },
      select: { spellcasting: true },
    });
    if (!cRow) throw new Error(`Character not found: ${characterId}`);
    const costCtx: PayCostContext = { tx, characterId, batchId, sessionId };
    await castAbilityInTx(
      { tx, characterId, batchId, sessionId, cost: costCtx, concentrationHost: normalizeSpellcastingMutable(cRow.spellcasting) },
      {
        name: spec.name,
        entryId: op.actionKey,
        cost: spec.cost,
        effect: spec.effect,
        roll: spec.apply?.amount ?? 0,
        eventType: "castSpell", // discarded — see comment above
        concentrates: false,
        apply: spec.apply,
      },
    );
    return;
  }

  const ops = ACTION_EFFECT_FN[op.actionKey](ctx);
  for (const effect of ops) {
    await applyActionEffectInTx(tx, characterId, effect, batchId, sessionId);
  }
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

/** Fail fast (400) on an op whose actionKey isn't in either dispatch table. */
function assertKnownActionKeys(operations: ExecuteActionOp[]): void {
  for (const op of operations) {
    if (!ACTION_CAST_FN[op.actionKey] && !ACTION_EFFECT_FN[op.actionKey]) {
      throw new UnknownActionError(`Unknown action key: ${op.actionKey}`);
    }
  }
}

/**
 * Level-derived Rage melee bonus, resolved before the transaction so the rage
 * effect fn stays pure (no DB). Only hits the DB when a rage op is present.
 */
async function computeRageDamageBonus(operations: ExecuteActionOp[], characterId: string): Promise<number> {
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
async function computeHeightenedFocusTempHp(operations: ExecuteActionOp[], characterId: string): Promise<number> {
  if (!operations.some((op) => op.actionKey === "patientDefenseFocus")) return 0;
  const classRow = await prisma.character.findUnique({
    where: { id: characterId },
    select: { classEntries: { select: { name: true, level: true } } },
  });
  const monkLevel = classRow?.classEntries.find((e) => e.name.toLowerCase() === "monk")?.level ?? 0;
  if (monkLevel < 10) return 0;
  const dieFaces = deriveMartialArtsDie(monkLevel);
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
    assertKnownActionKeys(operations);

    const rageDamageBonus = await computeRageDamageBonus(operations, characterId);
    const heightenedFocusTempHp = await computeHeightenedFocusTempHp(operations, characterId);
    const batchId = randomUUID();
    const sessionId = await getActiveSessionId(characterId);

    // Cross-domain atomic transaction — every op (cast-core, spendResource,
    // adjustQuantity, heal, tempHp) shares the same batchId so they appear as
    // one batch on the activity timeline and a single revertBatch undoes them all.
    await prisma.$transaction(async (tx) => {
      for (const op of operations) {
        await applyActionOpInTx(tx, characterId, op, batchId, sessionId, rageDamageBonus, heightenedFocusTempHp);
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
    // can revert this exact batch on turn undo (#758).
    res.json({ ...serializeCharacter(row), batchId });
  }
);
