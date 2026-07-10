import { Router } from "express";
import { z } from "zod";

import {
  applyDisciplineOperations,
  disciplineEffectSpec,
  InvalidDisciplineOperationError,
} from "@/lib/disciplines.js";
import { prisma } from "@/lib/prisma.js";
import { readAbilityCost } from "@/lib/ability-cost.js";
import { makeTransactionsEndpoint } from "@/lib/transactions-endpoint.js";

export const disciplinesRouter = Router({ mergeParams: true });

// Feeds the Four Elements monk's "learn a discipline" picker — same role as
// GET /api/maneuvers. Each row carries its min monk level, embedded ki cost
// (AbilityCost), and roll (EffectSpec, ki-scaled). Ordered by min level then name.
disciplinesRouter.get("/", async (_req, res) => {
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

makeTransactionsEndpoint({
  router: disciplinesRouter,
  schema: transactionsRequestSchema,
  apply: (characterId, data) => applyDisciplineOperations(characterId, data.operations),
  domainErrors: [InvalidDisciplineOperationError],
});
