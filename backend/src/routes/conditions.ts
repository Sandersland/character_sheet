// Owns POST /characters/:id/conditions/transactions (apply/remove conditions,
// set exhaustion). Mutation-router contract: apply ops atomically in the lib
// layer, then re-fetch with characterInclude and return
// serializeCharacter(updated).
import { Router } from "express";
import { z } from "zod";

import {
  applyConditionsOperations,
  InvalidConditionOperationError,
} from "../lib/conditions.js";
import { assertCharacterAccess } from "../lib/auth/access.js";
import { prisma } from "../lib/prisma.js";
import { CONDITIONS, EXHAUSTION_MAX, type ConditionKey } from "../lib/srd.js";
import { characterInclude } from "../lib/character-include.js";
import { serializeCharacter } from "../lib/character-serialize.js";

export const conditionsRouter = Router();

// ── Zod schemas ───────────────────────────────────────────────────────────────

const conditionKeySchema = z.enum(
  CONDITIONS.map((c) => c.key) as [ConditionKey, ...ConditionKey[]],
);

const applyConditionOpSchema = z.object({
  type: z.literal("applyCondition"),
  key: conditionKeySchema,
  source: z.string().min(1).optional(),
});

const removeConditionOpSchema = z.object({
  type: z.literal("removeCondition"),
  key: conditionKeySchema,
});

const setExhaustionOpSchema = z.object({
  type: z.literal("setExhaustion"),
  level: z.number().int().min(0).max(EXHAUSTION_MAX),
});

const operationSchema = z.discriminatedUnion("type", [
  applyConditionOpSchema,
  removeConditionOpSchema,
  setExhaustionOpSchema,
]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

// ── POST /api/characters/:id/conditions/transactions ───────────────────────────
//
// Intent-bearing batch mutation for status-condition state — mirrors
// POST /api/characters/:id/resources/transactions. Operations:
//   applyCondition   — add a standard 5e condition (prone, poisoned, …)
//   removeCondition  — remove an active condition by key
//   setExhaustion    — set exhaustion to an absolute level (0–6)
//
// Returns the full updated character on success.

conditionsRouter.post("/characters/:id/conditions/transactions", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const parseResult = transactionsRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  try {
    await applyConditionsOperations(req.params.id, parseResult.data.operations);
  } catch (error) {
    if (error instanceof InvalidConditionOperationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  const updated = await prisma.character.findUnique({
    where: { id: req.params.id },
    include: characterInclude,
  });
  res.json(serializeCharacter(updated!));
});
