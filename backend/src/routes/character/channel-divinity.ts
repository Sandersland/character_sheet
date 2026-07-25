import { Router } from "express";

import { assertCharacterAccess } from "@/lib/auth/access.js";
import {
  describeChannelDivinity,
  CHANNEL_DIVINITY_OPTIONS,
  isEntitled,
  type GateEntry,
} from "@/lib/classes/channel-divinity.js";
import { proficiencyBonusForLevel, levelForExperience } from "@/lib/leveling/experience.js";
import { prisma } from "@/lib/core/prisma.js";

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
