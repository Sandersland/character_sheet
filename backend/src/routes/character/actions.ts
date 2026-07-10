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
import { prisma } from "@/lib/core/prisma.js";
import { ACTION_EFFECT_FN, ACTION_CAST_FN, rageMeleeDamageBonus } from "@/lib/actions.js";
import { castAbilityInTx } from "@/lib/ability-cast.js";
import type { PayCostContext } from "@/lib/ability-cost.js";
import type { SpendResourceOperation } from "@/lib/resources.js";
import type { AdjustQuantityOperation } from "@/lib/inventory/inventory.js";
import { applyAdjustQuantity } from "@/lib/inventory/inventory.js";
import { applyHealInTx } from "@/lib/hitpoints.js";
import { applySpendResourceInTx } from "@/lib/resources.js";
import { appendActiveBuffInTx, clearBuffByKeyInTx } from "@/lib/active-effects.js";
import { normalizeSpellcastingMutable } from "@/lib/spell-state.js";
import { getActiveSessionId } from "@/lib/sessions.js";
import { characterInclude } from "@/lib/character-include.js";
import { serializeCharacter } from "@/lib/character-serialize.js";

export const actionsRouter = Router({ mergeParams: true });

// ── POST /api/characters/:id/actions/transactions ─────────────────────────────

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

    try {
      // Fail fast on unknown keys BEFORE any DB work (400, not 500).
      for (const op of operations) {
        if (!ACTION_CAST_FN[op.actionKey] && !ACTION_EFFECT_FN[op.actionKey]) {
          throw new Error(`Unknown action key: ${op.actionKey}`);
        }
      }

      // Level-derived Rage bonus, so the rage effect fn stays pure (no DB).
      // Only fires when a rage op is actually present — other batches skip the round-trip.
      let rageDamageBonus = 0;
      if (operations.some((op) => op.actionKey === "rage")) {
        const classRow = await prisma.character.findUnique({
          where: { id: characterId },
          select: { classEntries: { select: { name: true, level: true } } },
        });
        const barbarianLevel = classRow?.classEntries.find((e) => e.name.toLowerCase() === "barbarian")?.level ?? 0;
        rageDamageBonus = rageMeleeDamageBonus(barbarianLevel);
      }
      const batchId = randomUUID();
      const sessionId = await getActiveSessionId(characterId);

      // Cross-domain atomic transaction — every op (cast-core, spendResource,
      // adjustQuantity, heal) shares the same batchId so they appear as one
      // batch on the activity timeline and a single revertBatch undoes them all.
      await prisma.$transaction(async (tx) => {
        for (const op of operations) {
          const ctx = { roll: op.roll, inventoryItemId: op.inventoryItemId, rageDamageBonus };

          // Cast-core actions (Second Wind #420): pay the pool cost + self-apply
          // the heal through the shared caster. The OpOutcome is intentionally
          // not logged — byte-parity keeps only the spend + heal events.
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
            continue;
          }

          const ops = ACTION_EFFECT_FN[op.actionKey](ctx);
          for (const effect of ops) {
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

              case "applyBuff":
                await appendActiveBuffInTx(tx, characterId, effect.buff, batchId, sessionId);
                break;

              case "clearBuff":
                await clearBuffByKeyInTx(tx, characterId, effect.key, batchId, sessionId, effect.reason);
                break;

              default: {
                // Exhaustive — ACTION_EFFECT_FN returns the five op types above.
                const _never: never = effect;
                throw new Error(`Unexpected op type in action effect: ${JSON.stringify(_never)}`);
              }
            }
          }
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

      res.json(serializeCharacter(row));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Action transaction failed";
      // Distinguish bad-request errors (negative heal, unknown resource, etc.)
      // from genuine 500s by checking for known domain error message patterns.
      const isBadRequest =
        msg.includes("not found on this character") ||
        msg.includes("Cannot reduce") ||
        msg.includes("below zero") ||
        msg.includes("only ") ||
        msg.includes("not available") ||
        msg.includes("amount must be positive") ||
        msg.includes("Unknown action key");
      res.status(isBadRequest ? 400 : 500).json({ error: msg });
    }
  }
);
