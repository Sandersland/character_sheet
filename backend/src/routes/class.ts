import { Router } from "express";
import { z } from "zod";

import {
  applyClassOperations,
  InvalidClassOperationError,
} from "../lib/class.js";
import { assertCharacterAccess } from "../lib/auth/access.js";
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

const addClassOpSchema = z.object({
  type: z.literal("addClass"),
  classId: z.string().min(1),
  method: z.enum(["average", "roll"]).optional(),
  roll: z.number().int().positive().optional(),
});

const operationSchema = z.discriminatedUnion("type", [
  setSubclassOpSchema,
  setFightingStyleOpSchema,
  addClassOpSchema,
]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

// ── POST /api/characters/:id/class/transactions ───────────────────────────────
//
// Intent-bearing batch mutation for class-level choices:
//   setSubclass       — choose a subclass when the character's level meets the
//                       class's threshold (e.g. Fighter L3 → Battle Master).
//   setFightingStyle  — choose a Fighter L1 fighting style.
//   addClass          — multiclass into a new class (level-1 entry at the next
//                       position), validated against 5e ability prerequisites.
//
// Returns the full updated character on success.

classRouter.post("/characters/:id/class/transactions", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const parseResult = transactionsRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  try {
    await applyClassOperations(req.params.id, parseResult.data.operations);
  } catch (error) {
    if (error instanceof InvalidClassOperationError) {
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
