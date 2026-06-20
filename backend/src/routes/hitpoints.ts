import { Router } from "express";
import { z } from "zod";

import { applyHitPointOperations, InvalidHitPointOperationError } from "../lib/hitpoints.js";
import { prisma } from "../lib/prisma.js";
import { characterInclude, serializeCharacter } from "./characters.js";

export const hitPointsRouter = Router();

// ---- Per-op Zod schemas ---- (discriminated on `type`) --------------------

const damageOpSchema = z.object({
  type: z.literal("damage"),
  amount: z.number().int().positive(),
});

const healOpSchema = z.object({
  type: z.literal("heal"),
  amount: z.number().int().positive(),
});

const setTempOpSchema = z.object({
  type: z.literal("setTemp"),
  amount: z.number().int().nonnegative(),
});

// `rolls` may be empty (spending 0 dice is a no-op; UI typically disables this).
// Upper-bound / range validation is done in lib/hitpoints.ts based on live state.
const shortRestOpSchema = z.object({
  type: z.literal("shortRest"),
  rolls: z.array(z.number().int().min(1)).min(0),
});

const longRestOpSchema = z.object({
  type: z.literal("longRest"),
});

// `roll` is optional in Zod — the lib validates it's present and in-range
// when method === "roll".
const levelUpOpSchema = z.object({
  type: z.literal("levelUp"),
  method: z.enum(["average", "roll"]),
  roll: z.number().int().min(1).optional(),
});

const deathSaveOpSchema = z.object({
  type: z.literal("deathSave"),
  roll: z.number().int().min(1).max(20),
});

const stabilizeOpSchema = z.object({
  type: z.literal("stabilize"),
});

const operationSchema = z.discriminatedUnion("type", [
  damageOpSchema,
  healOpSchema,
  setTempOpSchema,
  shortRestOpSchema,
  longRestOpSchema,
  levelUpOpSchema,
  deathSaveOpSchema,
  stabilizeOpSchema,
]);

const hpRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

// ---- Route ----------------------------------------------------------------

hitPointsRouter.post("/characters/:id/hp", async (req, res) => {
  const character = await prisma.character.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  const parseResult = hpRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  try {
    await applyHitPointOperations(character.id, parseResult.data.operations);
  } catch (error) {
    if (error instanceof InvalidHitPointOperationError) {
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
});
