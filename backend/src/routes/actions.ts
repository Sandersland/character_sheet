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

import { assertCharacterAccess } from "../lib/auth/access.js";
import { prisma } from "../lib/prisma.js";
import { ACTION_EFFECT_FN } from "../lib/actions.js";
import type { SpendResourceOperation } from "../lib/resources.js";
import type { AdjustQuantityOperation } from "../lib/inventory.js";
import { applyAdjustQuantity } from "../lib/inventory.js";
import { applyHealInTx } from "../lib/hitpoints.js";
import { applySpendResourceInTx } from "../lib/resources.js";
import { getActiveSessionId } from "../lib/sessions.js";
import {
  characterInclude,
  serializeCharacter,
} from "./characters.js";

export const actionsRouter = Router();

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

actionsRouter.post(
  "/characters/:id/actions/transactions",
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
      // Resolve all ops to their effect lists BEFORE opening a transaction so
      // unknown action keys fail with a 400, not a 500 mid-transaction.
      const resolvedOps = operations.flatMap((op) => {
        const effectFn = ACTION_EFFECT_FN[op.actionKey];
        if (!effectFn) {
          throw new Error(`Unknown action key: ${op.actionKey}`);
        }
        return effectFn({ roll: op.roll, inventoryItemId: op.inventoryItemId });
      });
      const batchId = randomUUID();
      const sessionId = await getActiveSessionId(characterId);

      // Cross-domain atomic transaction — all three op types (spendResource,
      // adjustQuantity, heal) share the same batchId so they appear as one
      // batch on the activity timeline and a single revertBatch undoes them all.
      await prisma.$transaction(async (tx) => {
        for (const op of resolvedOps) {
          switch (op.type) {
            case "spendResource":
              // Cast: SpendResourceOp is a structural subset of SpendResourceOperation
              // (omits optional `roll`). Safe because applySpendResourceInTx treats
              // roll as optional and defaults to undefined.
              await applySpendResourceInTx(
                tx, characterId, op as SpendResourceOperation, batchId, sessionId
              );
              break;

            case "adjustQuantity":
              // Cast: AdjustQuantityOp is structurally identical to AdjustQuantityOperation.
              await applyAdjustQuantity(
                tx, characterId, op as AdjustQuantityOperation, batchId, sessionId
              );
              break;

            case "heal":
              await applyHealInTx(tx, characterId, op.amount, batchId, sessionId);
              break;

            default: {
              // Exhaustive — ACTION_EFFECT_FN only returns the three types above.
              const _never: never = op;
              throw new Error(`Unexpected op type in action effect: ${JSON.stringify(_never)}`);
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
