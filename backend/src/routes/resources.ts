// Owns POST /characters/:id/resources/transactions (spend/restore class
// resources, learn/forget maneuvers + tool profs). Like every mutation router
// here, it validates a Zod op union, applies it atomically in the lib layer,
// then re-fetches with characterInclude and returns serializeCharacter(updated)
// so the response carries the full, freshly-derived character.
import { Router } from "express";
import { z } from "zod";

import {
  applyResourceOperations,
  InvalidResourceOperationError,
} from "../lib/resources.js";
import { assertCharacterAccess } from "../lib/auth/access.js";
import { prisma } from "../lib/prisma.js";
import { characterInclude, serializeCharacter } from "./characters.js";

export const resourcesRouter = Router();

// ── Zod schemas ───────────────────────────────────────────────────────────────

const spendResourceOpSchema = z.object({
  type: z.literal("spendResource"),
  key: z.string().min(1),
  amount: z.number().int().positive().optional(),
  roll: z.number().int().optional(),
});

const restoreResourceOpSchema = z.object({
  type: z.literal("restoreResource"),
  key: z.string().min(1),
  amount: z.number().int().positive().optional(),
});

const learnManeuverOpSchema = z
  .object({
    type: z.literal("learnManeuver"),
    maneuverId: z.string().optional(),
    custom: z
      .object({ name: z.string().min(1), description: z.string().min(1) })
      .optional(),
  })
  .refine((op) => Boolean(op.maneuverId) !== Boolean(op.custom), {
    message: "Provide exactly one of maneuverId or custom",
  });

const forgetManeuverOpSchema = z.object({
  type: z.literal("forgetManeuver"),
  entryId: z.string().min(1),
});

const learnToolProficiencyOpSchema = z.object({
  type: z.literal("learnToolProficiency"),
  name: z.string().min(1),
});

const forgetToolProficiencyOpSchema = z.object({
  type: z.literal("forgetToolProficiency"),
  entryId: z.string().min(1),
});

const operationSchema = z.discriminatedUnion("type", [
  spendResourceOpSchema,
  restoreResourceOpSchema,
  learnManeuverOpSchema,
  forgetManeuverOpSchema,
  learnToolProficiencyOpSchema,
  forgetToolProficiencyOpSchema,
]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

// ── POST /api/characters/:id/resources/transactions ───────────────────────────
//
// Intent-bearing batch mutation for class/subclass resource state — mirrors
// POST /api/characters/:id/spellcasting/transactions. Operations:
//   spendResource         — spend one or more units of a pool (e.g. superiority die)
//   restoreResource       — restore spent units (undo mis-click or Relentless trigger)
//   learnManeuver         — add a maneuver from catalog or custom payload
//   forgetManeuver        — remove a known maneuver by entry id
//   learnToolProficiency  — choose an artisan's tool (Student of War, level 3+)
//   forgetToolProficiency — undo a tool proficiency choice by entry id
//
// Returns the full updated character on success.

resourcesRouter.post("/characters/:id/resources/transactions", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const parseResult = transactionsRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  try {
    await applyResourceOperations(req.params.id, parseResult.data.operations);
  } catch (error) {
    if (error instanceof InvalidResourceOperationError) {
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
