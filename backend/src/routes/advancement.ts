import { Router } from "express";
import { z } from "zod";

import {
  applyAdvancementOperations,
  InvalidAdvancementOperationError,
} from "../lib/advancement.js";
import { prisma } from "../lib/prisma.js";
import { FEAT_IMPROVEMENT_TARGETS } from "../lib/srd.js";
import { characterInclude, serializeCharacter } from "./characters.js";

export const advancementRouter = Router();

// ── Zod schemas ───────────────────────────────────────────────────────────────

const increaseSchema = z.object({
  ability: z.string().min(1),
  amount: z.union([z.literal(1), z.literal(2)]),
});

const takeAsiOpSchema = z.object({
  type: z.literal("takeAsi"),
  increases: z.array(increaseSchema).min(1).max(2),
});

const featImprovementSchema = z
  .object({
    target: z.enum(FEAT_IMPROVEMENT_TARGETS),
    amount: z.number().int(),
    perLevel: z.boolean().optional(),
    key: z.string().optional(),
  })
  .refine(
    (imp) => {
      const keyedTargets: string[] = ["skillProficiency", "savingThrowProficiency"];
      return keyedTargets.includes(imp.target) ? !!imp.key : true;
    },
    { message: "FeatImprovement: 'key' is required for skillProficiency and savingThrowProficiency targets" },
  );

const takeFeatOpSchema = z
  .object({
    type: z.literal("takeFeat"),
    featId: z.string().optional(),
    custom: z
      .object({
        name: z.string().min(1),
        description: z.string(),
        improvements: z.array(featImprovementSchema).optional(),
        /** Ability names the player may choose for a half-feat-style bump. */
        abilityOptions: z.array(z.string()).optional(),
        /** Amount to apply to the chosen ability (default 1). */
        abilityIncrease: z.number().int().min(1).optional(),
      })
      .optional(),
    abilityChoice: z.string().optional(),
  })
  .refine((op) => Boolean(op.featId) !== Boolean(op.custom), {
    message: "Provide exactly one of featId or custom",
  });

const removeAdvancementOpSchema = z.object({
  type: z.literal("removeAdvancement"),
  entryId: z.string().min(1),
});

const operationSchema = z.discriminatedUnion("type", [
  takeAsiOpSchema,
  takeFeatOpSchema,
  removeAdvancementOpSchema,
]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

// ── POST /api/characters/:id/advancement/transactions ─────────────────────────
//
// Intent-bearing batch mutation for Ability Score Improvements and Feats.
// Operations:
//   takeAsi             — raise one ability by +2, or two abilities by +1 each
//   takeFeat            — spend a slot on a catalog or custom feat
//   removeAdvancement   — reverse a previously taken ASI or feat by entry id
//
// Returns the full updated character on success.

advancementRouter.post(
  "/characters/:id/advancement/transactions",
  async (req, res) => {
    const character = await prisma.character.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!character) {
      res.status(404).json({ error: "Character not found" });
      return;
    }

    const parseResult = transactionsRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: parseResult.error.flatten(),
      });
      return;
    }

    try {
      await applyAdvancementOperations(character.id, parseResult.data.operations);
    } catch (error) {
      if (error instanceof InvalidAdvancementOperationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }

    const updated = await prisma.character.findUnique({
      where: { id: character.id },
      include: characterInclude,
    });
    res.json(serializeCharacter(updated!));
  },
);
