import { Router } from "express";
import { z } from "zod";

import { readAbilityCost } from "@/lib/spellcasting/ability-cost.js";
import {
  applyShadowArtsOperations,
  shadowArtEffectSpec,
  InvalidShadowArtOperationError,
} from "@/lib/classes/shadow-arts.js";
import { prisma } from "@/lib/core/prisma.js";
import { makeTransactionsEndpoint } from "@/lib/http/transactions-endpoint.js";

export const shadowArtsRouter = Router({ mergeParams: true });

// Feeds the Way of Shadow monk's Shadow Arts picker — mirrors GET /api/disciplines.
// Each row carries its embedded focus cost (AbilityCost) and flat EffectSpec.
shadowArtsRouter.get("/", async (_req, res) => {
  const arts = await prisma.grantedAbility.findMany({
    where: { source: "shadowArts" },
    orderBy: [{ name: "asc" }],
  });

  res.json(
    arts.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      minLevel: row.minLevel,
      cost: readAbilityCost(row),
      effect: shadowArtEffectSpec(row),
    })),
  );
});

const castShadowArtOpSchema = z.object({
  type: z.literal("castShadowArt"),
  shadowArtId: z.string().min(1),
});

const operationSchema = z.discriminatedUnion("type", [castShadowArtOpSchema]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

/**
 * POST /api/characters/:id/shadow-arts/transactions
 * Intent-bearing batch mutation for Shadow Arts — mirrors the disciplines
 * endpoint. The one op today:
 *   castShadowArt — spend a flat 2 focus, apply concentration/buff, log the cast.
 */
makeTransactionsEndpoint({
  router: shadowArtsRouter,
  schema: transactionsRequestSchema,
  apply: (characterId, data) => applyShadowArtsOperations(characterId, data.operations),
  domainErrors: [InvalidShadowArtOperationError],
});
