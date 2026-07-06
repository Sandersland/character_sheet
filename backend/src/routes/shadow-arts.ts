import { Router } from "express";
import { z } from "zod";

import { assertCharacterAccess } from "../lib/auth/access.js";
import { readAbilityCost } from "../lib/ability-cost.js";
import {
  applyShadowArtsOperations,
  shadowArtEffectSpec,
  InvalidShadowArtOperationError,
} from "../lib/shadow-arts.js";
import { prisma } from "../lib/prisma.js";
import { characterInclude } from "../lib/character-include.js";
import { serializeCharacter } from "../lib/character-serialize.js";

export const shadowArtsRouter = Router({ mergeParams: true });

// Feeds the Way of Shadow monk's Shadow Arts picker — mirrors GET /api/disciplines.
// Each row carries its embedded ki cost (AbilityCost) and flat EffectSpec.
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

// ── POST /api/characters/:id/shadow-arts/transactions ─────────────────────────
//
// Intent-bearing batch mutation for Shadow Arts — mirrors the disciplines
// endpoint. The one op today:
//   castShadowArt — spend a flat 2 ki, apply concentration/buff, log the cast.

const castShadowArtOpSchema = z.object({
  type: z.literal("castShadowArt"),
  shadowArtId: z.string().min(1),
});

const operationSchema = z.discriminatedUnion("type", [castShadowArtOpSchema]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

shadowArtsRouter.post<{ id: string }>("/transactions", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const parseResult = transactionsRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  try {
    await applyShadowArtsOperations(req.params.id, parseResult.data.operations);
  } catch (error) {
    if (error instanceof InvalidShadowArtOperationError) {
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
