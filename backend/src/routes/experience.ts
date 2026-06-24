import { Router } from "express";
import { z } from "zod";

import { applyExperienceOperations, InvalidExperienceOperationError } from "../lib/experience-ops.js";
import { prisma } from "../lib/prisma.js";
import { characterInclude, serializeCharacter } from "./characters.js";

export const experienceRouter = Router();

// ── Per-op Zod schemas ── (discriminated on `type`) ─────────────────────────

const awardOpSchema = z.object({
  type: z.literal("award"),
  // Signed — positive = gain, negative = correction/deduction.
  amount: z.number().int(),
});

const setOpSchema = z.object({
  type: z.literal("set"),
  value: z.number().int().nonnegative(),
});

const operationSchema = z.discriminatedUnion("type", [awardOpSchema, setOpSchema]);

const experienceRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
  // Optional: tag the resulting xpAward/xpSet events to a SPECIFIC session
  // (used by the retroactive "add XP to a past session" flow) instead of the
  // currently-active one. When supplied, that session's stored summary is
  // recomputed server-side. Must belong to the character (400 otherwise).
  sessionId: z.string().uuid().optional(),
});

// ── Route ────────────────────────────────────────────────────────────────────

// POST /api/characters/:id/experience
// Intent-bearing XP mutations: award (signed delta) and set (absolute).
// Unlike PATCH /api/characters/:id, this endpoint:
//   - Writes a CharacterEvent for each op so the activity timeline records it.
//   - Auto-reverses HP/hit-dice if the new XP drops the derived level below
//     the number of levelUp ops already applied — fixing the stranded-HP bug.
//
// The `experiencePoints` field has been removed from PATCH /api/characters/:id
// so all XP changes must go through here.
experienceRouter.post("/characters/:id/experience", async (req, res) => {
  const character = await prisma.character.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  const parseResult = experienceRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  try {
    await applyExperienceOperations(
      character.id,
      parseResult.data.operations,
      parseResult.data.sessionId,
    );
  } catch (error) {
    if (error instanceof InvalidExperienceOperationError) {
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
