import { Router } from "express";
import { z } from "zod";

import {
  applyWarriorOfElementsOperations,
  ELEMENTAL_DAMAGE_TYPES,
  InvalidWarriorOfElementsOperationError,
} from "@/lib/classes/warrior-of-elements.js";
import { InvalidResourceOperationError } from "@/lib/classes/resources.js";
import { makeTransactionsEndpoint } from "@/lib/http/transactions-endpoint.js";

export const warriorOfElementsRouter = Router({ mergeParams: true });

const elementalDamageTypeSchema = z.enum(ELEMENTAL_DAMAGE_TYPES);

const toggleAttunementOpSchema = z.object({
  type: z.literal("toggleElementalAttunement"),
  active: z.boolean(),
});

const castElementalBurstOpSchema = z.object({
  type: z.literal("castElementalBurst"),
  damageType: elementalDamageTypeSchema,
  roll: z.number().positive(),
});

const elementalStrikeOpSchema = z.object({
  type: z.literal("elementalStrike"),
  damageType: elementalDamageTypeSchema,
  roll: z.number().positive().optional(),
});

const operationSchema = z.discriminatedUnion("type", [
  toggleAttunementOpSchema,
  castElementalBurstOpSchema,
  elementalStrikeOpSchema,
]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

/**
 * POST /api/characters/:id/elements/transactions
 * Warrior of the Elements (2024) session actions:
 *   toggleElementalAttunement — spend 1 Focus to imbue for 10 min (or clear it)
 *   castElementalBurst        — spend 2 Focus, roll 3× Martial Arts die vs a Dex save
 *   elementalStrike           — while attuned, swap the strike's damage type and
 *                               force a Str save to move the target 10 ft
 * Returns the updated character plus a per-op `results` array for the toast.
 */
makeTransactionsEndpoint({
  router: warriorOfElementsRouter,
  schema: transactionsRequestSchema,
  apply: (characterId, data) => applyWarriorOfElementsOperations(characterId, data.operations),
  domainErrors: [InvalidWarriorOfElementsOperationError, InvalidResourceOperationError],
  respond: (character, results) => ({ character, results }),
});
