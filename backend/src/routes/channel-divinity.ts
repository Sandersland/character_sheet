import { Router } from "express";
import { z } from "zod";

import { assertCharacterAccess } from "../lib/auth/access.js";
import { InvalidResourceOperationError } from "../lib/resources.js";
import { InvalidSpellcastingOperationError } from "../lib/ability-cost.js";
import {
  applyChannelDivinityOperations,
  describeChannelDivinity,
  CHANNEL_DIVINITY_OPTIONS,
  isEntitled,
  InvalidChannelDivinityOperationError,
  type GateEntry,
} from "../lib/channel-divinity.js";
import { proficiencyBonusForLevel, levelForExperience } from "../lib/experience.js";
import { prisma } from "../lib/prisma.js";
import { characterInclude } from "../lib/character-include.js";
import { serializeCharacter } from "../lib/character-serialize.js";

export const channelDivinityRouter = Router();

// Character-scoped picker: the Channel Divinity options this cleric/paladin is
// entitled to, each with its cost, save DC (announce options), and reminder.
// Unlike GET /maneuvers, the list is subclass-specific so it is gated per-id.
channelDivinityRouter.get("/characters/:id/channel-divinity", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "view");

  const character = await prisma.character.findUnique({
    where: { id: req.params.id },
    select: {
      experiencePoints: true,
      abilityScores: true,
      classEntries: { orderBy: { position: "asc" as const }, select: { name: true, subclass: true, level: true } },
    },
  });
  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  const level = levelForExperience(character.experiencePoints);
  const profBonus = proficiencyBonusForLevel(level);
  const abilityScores = character.abilityScores as Record<string, number>;
  const entries: GateEntry[] = character.classEntries;

  const rows = await prisma.grantedAbility.findMany({
    where: { source: "channelDivinity" },
    orderBy: { name: "asc" },
  });

  const options = rows
    .map((row) => ({ row, gate: CHANNEL_DIVINITY_OPTIONS[row.name] }))
    .filter((o) => o.gate && isEntitled(o.gate, entries, level))
    .map(({ row, gate }) => describeChannelDivinity(row, gate, { abilityScores, profBonus, classLevel: level }));

  res.json(options);
});

// ── POST /api/characters/:id/channel-divinity/transactions ────────────────────
//
// Intent-bearing batch mutation — mirrors the shadow-arts endpoint. The one op:
//   castChannelDivinity — spend 1 CD charge; apply the option's real side effect
//   (Sacred Weapon attack buff, Cloak of Shadows invisibility) or reminder/DC.

const castChannelDivinityOpSchema = z.object({
  type: z.literal("castChannelDivinity"),
  abilityId: z.string().min(1),
});

const operationSchema = z.discriminatedUnion("type", [castChannelDivinityOpSchema]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

channelDivinityRouter.post("/characters/:id/channel-divinity/transactions", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const parseResult = transactionsRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  try {
    await applyChannelDivinityOperations(req.params.id, parseResult.data.operations);
  } catch (error) {
    if (
      error instanceof InvalidChannelDivinityOperationError ||
      error instanceof InvalidResourceOperationError ||
      error instanceof InvalidSpellcastingOperationError
    ) {
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
