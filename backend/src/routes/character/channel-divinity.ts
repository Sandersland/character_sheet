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
import { resolveEditionCatalog, withEditionOrShared } from "@/lib/rules/catalog-edition.js";
import { editionOf } from "@/lib/rules/edition.js";

export const channelDivinityRouter = Router({ mergeParams: true });

// Edition comes off the Character row via editionOf, not a `?edition=` param. A cross-edition row is omitted silently here (a list read has no player intent to contradict) — unlike crossEditionRejection on the cast path, where a supplied id does.
channelDivinityRouter.get<{ id: string }>("/", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "view");

  const character = await prisma.character.findUnique({
    where: { id: req.params.id },
    select: {
      experiencePoints: true,
      abilityScores: true,
      rulesEdition: true,
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

  const edition = editionOf(character);
  const candidates = await prisma.grantedAbility.findMany({
    where: withEditionOrShared({ source: "channelDivinity" }, edition),
    orderBy: { name: "asc" },
  });
  // Resolved before the gate map so CHANNEL_DIVINITY_OPTIONS only ever sees one row per name — it keys on the bare display name, so a same-name 2014/2024 fork would otherwise serve the option twice.
  const rows = resolveEditionCatalog(candidates, edition, (row) => row.name);

  const options = rows
    .map((row) => ({ row, gate: CHANNEL_DIVINITY_OPTIONS[row.name] }))
    .filter((o) => o.gate && isEntitled(o.gate, entries, level, edition))
    .map(({ row, gate }) => describeChannelDivinity(row, gate, { abilityScores, profBonus, classLevel: level, edition }));

  res.json(options);
});
