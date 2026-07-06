import { Router } from "express";
import { z } from "zod";

import { assertCharacterAccess } from "../lib/auth/access.js";
import {
  applyDisciplineOperations,
  disciplineEffectSpec,
  InvalidDisciplineOperationError,
} from "../lib/disciplines.js";
import { prisma } from "../lib/prisma.js";
import { readAbilityCost } from "../lib/ability-cost.js";
import { characterInclude } from "../lib/character-include.js";
import { serializeCharacter } from "../lib/character-serialize.js";

export const disciplinesRouter = Router();

// Feeds the Four Elements monk's "learn a discipline" picker — same role as
// GET /api/maneuvers. Each row carries its min monk level, embedded ki cost
// (AbilityCost), and roll (EffectSpec, ki-scaled). Ordered by min level then name.
disciplinesRouter.get("/disciplines", async (_req, res) => {
  const disciplines = await prisma.grantedAbility.findMany({
    where: { source: "discipline" },
    orderBy: [{ minLevel: "asc" }, { name: "asc" }],
  });

  res.json(
    disciplines.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      minLevel: row.minLevel,
      alwaysKnown: row.alwaysKnown,
      saveAbility: row.saveAbility,
      cost: readAbilityCost(row),
      effect: disciplineEffectSpec(row),
    })),
  );
});

// ── POST /api/characters/:id/disciplines/transactions ─────────────────────────
//
// Intent-bearing batch mutation for elemental disciplines — mirrors the
// spellcasting/resources transaction endpoints. The one op today:
//   castDiscipline — spend ki, roll the discipline's EffectSpec, log the cast.

const castDisciplineOpSchema = z.object({
  type: z.literal("castDiscipline"),
  disciplineId: z.string().min(1),
  kiSpent: z.number().int().min(0).max(6),
  roll: z.number().int().min(0),
});

const operationSchema = z.discriminatedUnion("type", [castDisciplineOpSchema]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

disciplinesRouter.post("/characters/:id/disciplines/transactions", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const parseResult = transactionsRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  try {
    await applyDisciplineOperations(req.params.id, parseResult.data.operations);
  } catch (error) {
    if (error instanceof InvalidDisciplineOperationError) {
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
