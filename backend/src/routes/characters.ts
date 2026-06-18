import { Router } from "express";
import { z } from "zod";

import { Prisma } from "../generated/prisma/client.js";
import type { Character as CharacterRow } from "../generated/prisma/client.js";
import { experienceProgress, levelForExperience } from "../lib/experience.js";
import { prisma } from "../lib/prisma.js";

export const charactersRouter = Router();

function serializeCharacterSummary(
  row: Pick<
    CharacterRow,
    "id" | "name" | "race" | "class" | "portraitUrl" | "experiencePoints"
  >
) {
  return {
    id: row.id,
    name: row.name,
    race: row.race,
    class: row.class,
    level: levelForExperience(row.experiencePoints),
    portraitUrl: row.portraitUrl ?? undefined,
  };
}

// Json columns (hitPoints, hitDice, abilityScores, skills, inventory,
// currency, spellcasting, journal) are round-tripped as-is below — they
// were written by our own seed/PATCH path, not external input, so they
// aren't re-validated against the frontend Character type's nested shapes
// here.
function serializeCharacter(row: CharacterRow) {
  const progress = experienceProgress(row.experiencePoints);

  return {
    id: row.id,
    name: row.name,
    race: row.race,
    class: row.class,
    subclass: row.subclass ?? undefined,
    level: progress.level,
    background: row.background,
    alignment: row.alignment,
    portraitUrl: row.portraitUrl ?? undefined,

    armorClass: row.armorClass,
    initiativeBonus: row.initiativeBonus,
    speed: row.speed,
    proficiencyBonus: progress.proficiencyBonus,

    experiencePoints: row.experiencePoints,
    currentLevelThreshold: progress.currentLevelThreshold,
    nextLevelThreshold: progress.nextLevelThreshold,

    hitPoints: row.hitPoints,
    hitDice: row.hitDice,
    abilityScores: row.abilityScores,
    savingThrowProficiencies: row.savingThrowProficiencies,
    skills: row.skills,
    inventory: row.inventory,
    currency: row.currency,
    spellcasting: row.spellcasting ?? undefined,
    journal: row.journal,
  };
}

charactersRouter.get("/characters", async (_req, res) => {
  const characters = await prisma.character.findMany({
    select: {
      id: true,
      name: true,
      race: true,
      class: true,
      portraitUrl: true,
      experiencePoints: true,
    },
    orderBy: { name: "asc" },
  });

  res.json(characters.map(serializeCharacterSummary));
});

charactersRouter.get("/characters/:id", async (req, res) => {
  const character = await prisma.character.findUnique({
    where: { id: req.params.id },
  });

  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  res.json(serializeCharacter(character));
});

// level and proficiencyBonus are deliberately absent from this schema —
// they're derived, never persisted, so .strict() rejects a client trying to
// set them directly instead of silently ignoring it.
const updateCharacterSchema = z
  .object({
    name: z.string().min(1),
    race: z.string().min(1),
    class: z.string().min(1),
    subclass: z.string().nullable(),
    background: z.string().min(1),
    alignment: z.string().min(1),
    portraitUrl: z.string().nullable(),
    experiencePoints: z.number().int().nonnegative(),
    armorClass: z.number().int(),
    initiativeBonus: z.number().int(),
    speed: z.number().int().nonnegative(),
    hitPoints: z.object({
      current: z.number().int(),
      max: z.number().int(),
      temp: z.number().int(),
    }),
    hitDice: z.object({ total: z.number().int(), die: z.string() }),
    abilityScores: z.record(z.string(), z.number().int()),
    savingThrowProficiencies: z.array(z.string()),
    skills: z.array(z.unknown()),
    inventory: z.array(z.unknown()),
    currency: z.object({
      cp: z.number().int(),
      sp: z.number().int(),
      gp: z.number().int(),
      pp: z.number().int(),
    }),
    spellcasting: z.unknown().nullable(),
    journal: z.array(z.unknown()),
  })
  .partial()
  .strict();

charactersRouter.patch("/characters/:id", async (req, res) => {
  const parseResult = updateCharacterSchema.safeParse(req.body);

  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  const existing = await prisma.character.findUnique({
    where: { id: req.params.id },
  });

  if (!existing) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  const updated = await prisma.character.update({
    where: { id: req.params.id },
    data: parseResult.data as Prisma.CharacterUpdateInput,
  });

  res.json(serializeCharacter(updated));
});
