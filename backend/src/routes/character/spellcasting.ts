import { Router } from "express";
import { z } from "zod";

import {
  applySpellcastingOperations,
  InvalidSpellcastingOperationError,
} from "@/lib/spellcasting/spellcasting.js";
import { makeTransactionsEndpoint } from "@/lib/http/transactions-endpoint.js";

export const spellcastingRouter = Router({ mergeParams: true });

const customSpellSchema = z.object({
  name: z.string().min(1),
  level: z.number().int().min(0).max(9),
  school: z.enum([
    "abjuration", "conjuration", "divination", "enchantment",
    "evocation", "illusion", "necromancy", "transmutation",
  ]),
  castingTime: z.string().min(1),
  range: z.string().min(1),
  duration: z.string().min(1),
  description: z.string().min(1),
  concentration: z.boolean().optional(),
  ritual: z.boolean().optional(),
  components: z
    .object({
      verbal: z.boolean(),
      somatic: z.boolean(),
      material: z.boolean(),
      materialDescription: z.string().optional(),
    })
    .optional(),
  saveEffect: z.enum(["half", "none"]).optional(),
  effectKind: z.enum(["damage", "heal"]).optional(),
  effectDiceCount: z.number().int().positive().optional(),
  effectDiceFaces: z.number().int().positive().optional(),
  effectModifier: z.number().int().optional(),
  damageType: z.string().optional(),
  attackType: z.enum(["attack", "save"]).optional(),
  saveAbility: z.string().optional(),
  upcastDicePerLevel: z.number().int().positive().optional(),
  cantripScaling: z.boolean().optional(),
});

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

const learnSpellOpSchema = z
  .object({
    type: z.literal("learnSpell"),
    spellId: z.string().optional(),
    custom: customSpellSchema.optional(),
  })
  .refine((op) => Boolean(op.spellId) !== Boolean(op.custom), {
    message: "Provide exactly one of spellId or custom",
  });

const forgetSpellOpSchema = z.object({
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

// Dismiss an active while-active spell buff by its spell entry id (#363) — e.g.
// ending Mage Armor early. Concentration buffs end via dropConcentration instead.
const dismissBuffOpSchema = z.object({
  type: z.literal("dismissBuff"),
  entryId: z.string().min(1),
});

const operationSchema = z.discriminatedUnion("type", [
  castSpellOpSchema,
  castItemSpellOpSchema,
  expendSlotOpSchema,
  restoreSlotOpSchema,
  learnSpellOpSchema,
  forgetSpellOpSchema,
  prepareSpellOpSchema,
  unprepareSpellOpSchema,
  dropConcentrationOpSchema,
  dismissBuffOpSchema,
]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

/**
 * POST /api/characters/:id/spellcasting/transactions
 * Intent-bearing batch mutation for spell state — mirrors
 * POST /api/characters/:id/inventory/transactions. Operations:
 *   castSpell  — cast a known spell, expend its slot (if leveled), log the roll
 *   expendSlot — bare slot expenditure (no spell association)
 *   restoreSlot — restore one expended slot (undo mis-click)
 *   learnSpell — add a spell from catalog (spellId) or custom payload
 *   forgetSpell — remove a spell from the spellbook by entryId
 *   prepareSpell / unprepareSpell — toggle preparation on a non-cantrip
 *
 * Returns the full updated character on success (same shape as all other
 * endpoints — re-fetched with characterInclude so derived spellcasting fields
 * reflect the new state).
 */
makeTransactionsEndpoint({
  router: spellcastingRouter,
  schema: transactionsRequestSchema,
  apply: (characterId, data, userId) => applySpellcastingOperations(characterId, data.operations, userId),
  domainErrors: [InvalidSpellcastingOperationError],
});
