import { Router } from "express";
import { z } from "zod";

import { Prisma } from "../generated/prisma/client.js";
import { experienceProgress, levelForExperience } from "../lib/experience.js";
import { prisma } from "../lib/prisma.js";
import { ALIGNMENTS, deriveCreatedCharacter } from "../lib/srd.js";

export const charactersRouter = Router();

// Shared `include` for fetching a full character with its race/background/
// class selections. classEntries is ordered so index 0 is always the
// primary class (v1 creates exactly one; multiclass support will append
// more at increasing `position` values later).
const characterInclude = {
  raceSelection: true,
  backgroundSelection: true,
  classEntries: { orderBy: { position: "asc" } },
} satisfies Prisma.CharacterInclude;

type CharacterWithRelations = Prisma.CharacterGetPayload<{ include: typeof characterInclude }>;

function serializeCharacterSummary(row: {
  id: string;
  name: string;
  portraitUrl: string | null;
  experiencePoints: number;
  raceSelection: { name: string } | null;
  classEntries: { name: string }[];
}) {
  return {
    id: row.id,
    name: row.name,
    // raceSelection/classEntries are optional in Prisma's types only
    // because they're the non-FK side of the relation — every character
    // created via POST /characters has exactly one of each.
    race: row.raceSelection?.name ?? "",
    class: row.classEntries[0]?.name ?? "",
    level: levelForExperience(row.experiencePoints),
    portraitUrl: row.portraitUrl ?? undefined,
  };
}

// Json columns (hitPoints, hitDice, abilityScores, skills, inventory,
// currency, spellcasting, journal) are round-tripped as-is below — they
// were written by our own seed/PATCH/POST path, not external input, so they
// aren't re-validated against the frontend Character type's nested shapes
// here.
function serializeCharacter(row: CharacterWithRelations) {
  const progress = experienceProgress(row.experiencePoints);
  const primaryClass = row.classEntries[0];

  return {
    id: row.id,
    name: row.name,
    race: row.raceSelection?.name ?? "",
    class: primaryClass?.name ?? "",
    subclass: primaryClass?.subclass ?? undefined,
    level: progress.level,
    background: row.backgroundSelection?.name ?? "",
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

    // Structured, multiclass-aware view alongside the flattened
    // class/subclass above — today always a single entry.
    classes: row.classEntries.map((entry) => ({
      name: entry.name,
      level: entry.level,
      subclass: entry.subclass ?? undefined,
      classId: entry.classId ?? undefined,
    })),
  };
}

charactersRouter.get("/characters", async (_req, res) => {
  const characters = await prisma.character.findMany({
    select: {
      id: true,
      name: true,
      portraitUrl: true,
      experiencePoints: true,
      raceSelection: { select: { name: true } },
      classEntries: { select: { name: true }, orderBy: { position: "asc" }, take: 1 },
    },
    orderBy: { name: "asc" },
  });

  res.json(characters.map(serializeCharacterSummary));
});

charactersRouter.get("/characters/:id", async (req, res) => {
  const character = await prisma.character.findUnique({
    where: { id: req.params.id },
    include: characterInclude,
  });

  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  res.json(serializeCharacter(character));
});

const abilityScoresSchema = z.object({
  strength: z.number().int(),
  dexterity: z.number().int(),
  constitution: z.number().int(),
  intelligence: z.number().int(),
  wisdom: z.number().int(),
  charisma: z.number().int(),
});

// A single class choice today, but the array shape means accepting a second
// entry later (multiclassing) doesn't require another request-schema
// migration, just relaxing the `.length(1)` constraint below.
const classChoiceSchema = z.object({
  name: z.string().min(1),
  subclass: z.string().nullable().optional(),
});

const createCharacterSchema = z
  .object({
    name: z.string().min(1),
    alignment: z.string().min(1),
    portraitUrl: z.string().nullable().optional(),
    experiencePoints: z.number().int().nonnegative().optional(),
    race: z.string().min(1),
    background: z.string().min(1),
    classes: z.array(classChoiceSchema).length(1),
    abilityScores: abilityScoresSchema,
    skillProficiencies: z.array(z.string()).optional(),
  })
  .strict();

charactersRouter.post("/characters", async (req, res) => {
  const parseResult = createCharacterSchema.safeParse(req.body);

  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  const input = parseResult.data;

  if (!ALIGNMENTS.includes(input.alignment)) {
    res.status(400).json({ error: `Unknown alignment: ${input.alignment}` });
    return;
  }

  const primaryClassChoice = input.classes[0];

  // Sequential rather than Promise.all: the pg driver adapter's pool can
  // warn/queue when the same PrismaClient fires concurrent queries, and
  // these are cheap point-lookups, so there's no real cost to awaiting
  // each in turn.
  const race = await prisma.race.findUnique({ where: { name: input.race } });
  const characterClass = await prisma.characterClass.findUnique({
    where: { name: primaryClassChoice.name },
  });
  const background = await prisma.background.findUnique({ where: { name: input.background } });

  // Mechanical derivation needs a catalog anchor for race + class. The
  // background only grants skill-proficiency choices (no mechanical
  // fields), so — unlike race/class — it's allowed to be homebrew: an
  // unresolved name is kept as-is with a null backgroundId rather than
  // rejected.
  if (!race) {
    res.status(400).json({ error: `Unknown race: ${input.race}` });
    return;
  }
  if (!characterClass) {
    res.status(400).json({ error: `Unknown class: ${primaryClassChoice.name}` });
    return;
  }

  const skillProficiencies = input.skillProficiencies ?? [];
  const allowedSkills = new Set([
    ...characterClass.skillChoices,
    ...(background?.skillProficiencies ?? []),
  ]);
  const invalidSkills = skillProficiencies.filter((skill) => !allowedSkills.has(skill));
  if (invalidSkills.length > 0) {
    res
      .status(400)
      .json({ error: `Invalid skill proficiencies: ${invalidSkills.join(", ")}` });
    return;
  }

  const maxSkillChoices = characterClass.skillChoiceCount + (background?.skillProficiencies.length ?? 0);
  if (skillProficiencies.length > maxSkillChoices) {
    res
      .status(400)
      .json({ error: `Too many skill proficiencies selected (max ${maxSkillChoices})` });
    return;
  }

  const derived = deriveCreatedCharacter(
    { abilityScores: input.abilityScores, skillProficiencies },
    { race, characterClass }
  );

  const created = await prisma.character.create({
    data: {
      name: input.name,
      alignment: input.alignment,
      portraitUrl: input.portraitUrl ?? null,
      experiencePoints: input.experiencePoints ?? 0,
      abilityScores: input.abilityScores,
      ...derived,
      // Prisma represents an explicit JSON null distinctly from "field
      // omitted" — derived.spellcasting is the app-level `null`, swapped
      // here for the sentinel Prisma's Json column type expects.
      spellcasting: Prisma.JsonNull,
      raceSelection: { create: { name: input.race, raceId: race.id } },
      backgroundSelection: {
        create: { name: input.background, backgroundId: background?.id ?? null },
      },
      classEntries: {
        create: [
          {
            name: primaryClassChoice.name,
            subclass: primaryClassChoice.subclass ?? null,
            classId: characterClass.id,
            position: 0,
          },
        ],
      },
    },
    include: characterInclude,
  });

  res.status(201).json(serializeCharacter(created));
});

// race/class/subclass/background are deliberately absent here — they're now
// relation-backed selections, not Character columns (see schema.prisma).
// level and proficiencyBonus are also absent — they're derived, never
// persisted, so .strict() rejects a client trying to set them directly
// instead of silently ignoring it.
const updateCharacterSchema = z
  .object({
    name: z.string().min(1),
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
    select: { id: true },
  });

  if (!existing) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  const updated = await prisma.character.update({
    where: { id: req.params.id },
    data: parseResult.data as Prisma.CharacterUpdateInput,
    include: characterInclude,
  });

  res.json(serializeCharacter(updated));
});
