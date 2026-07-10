import { Router } from "express";
import { z } from "zod";

import { assertCharacterAccess } from "@/lib/auth/access.js";
import { InvalidResourceOperationError } from "@/lib/classes/resources.js";
import { InvalidSpellcastingOperationError } from "@/lib/ability-cost.js";
import {
  applyChannelDivinityOperations,
  describeChannelDivinity,
  CHANNEL_DIVINITY_OPTIONS,
  isEntitled,
  InvalidChannelDivinityOperationError,
  type GateEntry,
} from "@/lib/classes/channel-divinity.js";
import { proficiencyBonusForLevel, levelForExperience } from "@/lib/leveling/experience.js";
import { prisma } from "@/lib/core/prisma.js";
import { makeTransactionsEndpoint } from "@/lib/http/transactions-endpoint.js";

export const channelDivinityRouter = Router({ mergeParams: true });

// Character-scoped picker: the Channel Divinity options this cleric/paladin is
// entitled to, each with its cost, save DC (announce options), and reminder.
// Unlike GET /maneuvers, the list is subclass-specific so it is gated per-id.
channelDivinityRouter.get<{ id: string }>("/", async (req, res) => {
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

makeTransactionsEndpoint({
  router: channelDivinityRouter,
  schema: transactionsRequestSchema,
  apply: (characterId, data) => applyChannelDivinityOperations(characterId, data.operations),
  domainErrors: [
    InvalidChannelDivinityOperationError,
    InvalidResourceOperationError,
    InvalidSpellcastingOperationError,
  ],
});
