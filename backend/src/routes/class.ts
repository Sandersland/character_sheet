import { Router } from "express";
import { z } from "zod";

import {
  applyClassOperations,
  InvalidClassOperationError,
} from "../lib/class.js";
import { prisma } from "../lib/prisma.js";
import { characterInclude, serializeCharacter } from "./characters.js";

export const classRouter = Router();

// ── Zod schemas ───────────────────────────────────────────────────────────────

const setSubclassOpSchema = z.object({
  type: z.literal("setSubclass"),
  subclassId: z.string().min(1),
});

const setFightingStyleOpSchema = z.object({
  type: z.literal("setFightingStyle"),
  key: z.enum([
    "archery",
    "defense",
    "dueling",
    "greatWeaponFighting",
    "protection",
    "twoWeaponFighting",
  ]),
});

const operationSchema = z.discriminatedUnion("type", [
  setSubclassOpSchema,
  setFightingStyleOpSchema,
]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

// ── POST /api/characters/:id/class/transactions ───────────────────────────────
//
// Intent-bearing batch mutation for class-level choices — today ships one op:
//   setSubclass — choose a subclass when the character's level meets the class's
//                 subclass-granting threshold (e.g. Fighter L3 → Battle Master).
//
// Returns the full updated character on success.

classRouter.post("/characters/:id/class/transactions", async (req, res) => {
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
    res.status(400).json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  try {
    await applyClassOperations(character.id, parseResult.data.operations);
  } catch (error) {
    if (error instanceof InvalidClassOperationError) {
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
