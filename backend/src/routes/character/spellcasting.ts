import { Router } from "express";
import { z } from "zod";

import {
  applySpellcastingOperations,
  InvalidSpellcastingOperationError,
} from "@/lib/spellcasting/spellcasting.js";
import { makeTransactionsEndpoint } from "@/lib/http/transactions-endpoint.js";

export const spellcastingRouter = Router({ mergeParams: true });

const castSpellOpSchema = z.object({
  type: z.literal("castSpell"),
  entryId: z.string().min(1),
  slotLevel: z.number().int().min(1).max(9).optional(),
  roll: z.number().int().min(0),
  apply: z
    .object({
      // "self" hits the caster; { characterId } heals a consenting ally (#462).
      target: z.union([z.literal("self"), z.object({ characterId: z.string().min(1) })]),
      kind: z.enum(["heal", "damage"]),
      amount: z.number().int().positive(),
    })
    .optional(),
});

const castItemSpellOpSchema = z.object({
  type: z.literal("castItemSpell"),
  entryId: z.string().min(1),
  roll: z.number().int().min(0),
  apply: z
    .object({
      target: z.union([z.literal("self"), z.object({ characterId: z.string().min(1) })]),
      kind: z.enum(["heal", "damage"]),
      amount: z.number().int().positive(),
    })
    .optional(),
});

const expendSlotOpSchema = z.object({
  type: z.literal("expendSlot"),
  level: z.number().int().min(1).max(9),
});

const restoreSlotOpSchema = z.object({
  type: z.literal("restoreSlot"),
  level: z.number().int().min(1).max(9),
});

// Wizard Arcane Recovery (#904): the lib enforces the cap (ceil(level/2) slot-levels, none above 5th) and the once-per-long-rest gate.
const arcaneRecoveryOpSchema = z.object({
  type: z.literal("arcaneRecovery"),
  slots: z
    .array(z.object({ level: z.number().int().min(1).max(9), count: z.number().int().positive() }))
    .min(1),
});

export const learnSpellOpSchema = z.object({
  type: z.literal("learnSpell"),
  spellId: z.string().min(1),
});

export const forgetSpellOpSchema = z.object({
  type: z.literal("forgetSpell"),
  entryId: z.string().min(1),
});

const prepareSpellOpSchema = z.object({
  type: z.literal("prepareSpell"),
  entryId: z.string().min(1),
});

const unprepareSpellOpSchema = z.object({
  type: z.literal("unprepareSpell"),
  entryId: z.string().min(1),
});

const dropConcentrationOpSchema = z.object({
  type: z.literal("dropConcentration"),
});

// Dismiss an active while-active spell buff by its spell entry id (#363) — e.g. ending Mage Armor early. Concentration buffs end via dropConcentration instead.
const dismissBuffOpSchema = z.object({
  type: z.literal("dismissBuff"),
  entryId: z.string().min(1),
});

// Sorcerer Font of Magic (#903): SP↔slot conversion. toSlot is capped at 5th level (the cost table); toSorceryPoints accepts any slot level.
const convertSorceryPointsOpSchema = z.object({
  type: z.literal("convertSorceryPoints"),
  direction: z.enum(["toSlot", "toSorceryPoints"]),
  slotLevel: z.number().int().min(1).max(9),
});

const operationSchema = z.discriminatedUnion("type", [
  castSpellOpSchema,
  castItemSpellOpSchema,
  expendSlotOpSchema,
  restoreSlotOpSchema,
  arcaneRecoveryOpSchema,
  learnSpellOpSchema,
  forgetSpellOpSchema,
  prepareSpellOpSchema,
  unprepareSpellOpSchema,
  dropConcentrationOpSchema,
  dismissBuffOpSchema,
  convertSorceryPointsOpSchema,
]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

/**
 * POST /api/characters/:id/spellcasting/transactions
 * Returns the full updated character, re-fetched with characterInclude so derived spellcasting fields reflect the new state.
 */
makeTransactionsEndpoint({
  router: spellcastingRouter,
  schema: transactionsRequestSchema,
  apply: (characterId, data, userId) => applySpellcastingOperations(characterId, data.operations, userId),
  domainErrors: [InvalidSpellcastingOperationError],
});
