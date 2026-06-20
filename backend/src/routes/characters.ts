import { Router } from "express";
import { z } from "zod";

import { Prisma } from "../generated/prisma/client.js";
import { experienceProgress, levelForExperience } from "../lib/experience.js";
import {
  serializeArmorDetail,
  serializeConsumableDetail,
  serializeWeaponDetail,
} from "../lib/itemDetail.js";
import { buildInventoryCreateFromCatalog, catalogItemDetailInclude } from "../lib/inventory.js";
import { prisma } from "../lib/prisma.js";
import { ALIGNMENTS, deriveCreatedCharacter, PACK_CONTENTS, STARTING_EQUIPMENT } from "../lib/srd.js";

export const charactersRouter = Router();

// Shared `include` for fetching a full character with its race/background/
// class selections. classEntries is ordered so index 0 is always the
// primary class (v1 creates exactly one; multiclass support will append
// more at increasing `position` values later). Exported for routes/
// inventory.ts to reuse — every inventory-transaction op returns the full
// serialized character, same shape as this file's own endpoints.
export const characterInclude = {
  raceSelection: true,
  backgroundSelection: true,
  classEntries: { orderBy: { position: "asc" } },
  inventoryItems: {
    orderBy: { position: "asc" },
    include: { weaponDetail: true, armorDetail: true, consumableDetail: true },
  },
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

// Json columns (hitPoints, hitDice, abilityScores, skills, currency,
// spellcasting, journal) are round-tripped as-is below — they were written
// by our own seed/PATCH/POST path, not external input, so they aren't
// re-validated against the frontend Character type's nested shapes here.
// inventory is the exception: it's relational (InventoryItem rows, see
// schema.prisma), mapped into the same JSON shape the frontend already
// expects below. weaponDetail/armorDetail/consumableDetail (at most one
// present, matching `category`) nest as nullable `weapon`/`armor`/
// `consumable` sub-objects via the shared lib/itemDetail.js serializers
// (also used by routes/items.ts for the catalog) rather than flattening
// back out — `id`/the owning FK aren't meaningful to the client.
function serializeInventoryItem(row: CharacterWithRelations["inventoryItems"][number]) {
  return {
    id: row.id,
    itemId: row.itemId ?? undefined,
    name: row.name,
    category: row.category,
    quantity: row.quantity,
    weight: row.weight ?? undefined,
    cost: row.cost ?? undefined,
    description: row.description ?? undefined,
    equipped: row.equipped,
    notes: row.notes ?? undefined,
    weapon: row.weaponDetail ? serializeWeaponDetail(row.weaponDetail) : undefined,
    armor: row.armorDetail ? serializeArmorDetail(row.armorDetail) : undefined,
    consumable: row.consumableDetail ? serializeConsumableDetail(row.consumableDetail) : undefined,
  };
}

export function serializeCharacter(row: CharacterWithRelations) {
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
    inventory: row.inventoryItems.map(serializeInventoryItem),
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

// One entry per choice group sent by the frontend when mode:"package". Each
// entry carries the chosen optionIndex within that group's options array and,
// for any open weapon picks in the chosen bundle, the catalog item names the
// player selected (in the same order as the bundle's openPicks array).
const packageSelectionSchema = z.object({
  optionIndex: z.number().int().nonnegative(),
  openPicks: z.array(z.string()).optional(),
});

const startingEquipmentSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("package"),
    selections: z.array(packageSelectionSchema),
  }),
  z.object({
    mode: z.literal("gold"),
    gold: z.number().int().nonnegative(),
  }),
]);

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
    startingEquipment: startingEquipmentSchema.optional(),
  })
  .strict();

// Resolves a list of FixedItemRef-style catalog names + quantities into
// InventoryItem nested-create payloads. Expands pack names via PACK_CONTENTS.
// Fetches all required catalog Items in one query (by name) and throws an
// object with a `message` string if any name is unknown, so the caller can
// return a 400.
async function resolveFixedItems(
  refs: { catalogName: string; quantity?: number }[]
): Promise<{ inventoryCreates: ReturnType<typeof buildInventoryCreateFromCatalog>[]; error?: string }> {
  // Expand packs first
  const expanded: { catalogName: string; quantity: number }[] = [];
  for (const ref of refs) {
    const packContents = PACK_CONTENTS[ref.catalogName];
    if (packContents) {
      for (const content of packContents) {
        expanded.push({ catalogName: content.catalogName, quantity: (content.quantity ?? 1) * (ref.quantity ?? 1) });
      }
    } else {
      expanded.push({ catalogName: ref.catalogName, quantity: ref.quantity ?? 1 });
    }
  }

  const names = [...new Set(expanded.map((r) => r.catalogName))];
  const items = await prisma.item.findMany({
    where: { name: { in: names } },
    include: catalogItemDetailInclude,
  });
  const itemByName = new Map(items.map((i) => [i.name, i]));

  const missing = names.filter((n) => !itemByName.has(n));
  if (missing.length > 0) {
    return { inventoryCreates: [], error: `Unknown catalog items: ${missing.join(", ")}` };
  }

  const inventoryCreates = expanded.map((ref, idx) =>
    buildInventoryCreateFromCatalog(itemByName.get(ref.catalogName)!, { quantity: ref.quantity, position: idx })
  );
  return { inventoryCreates };
}

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

  // ── Resolve starting equipment ──────────────────────────────────────────
  // Starting equipment is optional (omitting it creates an empty-inventory
  // character, preserving the existing behaviour and all current tests).
  // When provided, the backend re-resolves authoritatively against the
  // STARTING_EQUIPMENT rules — the frontend only sends choice indices and
  // open-pick item names; it never sends the full item list itself.
  //
  // We use a nested `inventoryItems: { create: [...] }` on character.create
  // rather than calling applyInventoryOperations: the character has no id
  // yet, and starting gear is genesis state, not an economic event — it
  // should not generate ledger rows (same reasoning prisma/seed.ts uses).
  let inventoryItemCreates: ReturnType<typeof buildInventoryCreateFromCatalog>[] = [];
  let startingCurrency: { cp: number; sp: number; gp: number; pp: number } | undefined;

  if (input.startingEquipment) {
    const se = input.startingEquipment;

    if (se.mode === "gold") {
      // Validate gold is within the class's dice range
      const classDef = STARTING_EQUIPMENT[primaryClassChoice.name];
      if (classDef) {
        const { diceCount, diceFaces, multiplier } = classDef.gold;
        const min = diceCount * multiplier;
        const max = diceCount * diceFaces * multiplier;
        if (se.gold < min || se.gold > max) {
          res.status(400).json({
            error: `Starting gold must be between ${min} and ${max} for ${primaryClassChoice.name}`,
          });
          return;
        }
      }
      startingCurrency = { cp: 0, sp: 0, gp: se.gold, pp: 0 };
    } else {
      // mode === "package"
      const classDef = STARTING_EQUIPMENT[primaryClassChoice.name];
      if (!classDef) {
        res.status(400).json({
          error: `No starting equipment package defined for class: ${primaryClassChoice.name}`,
        });
        return;
      }

      if (se.selections.length !== classDef.groups.length) {
        res.status(400).json({
          error: `Expected ${classDef.groups.length} equipment selections, got ${se.selections.length}`,
        });
        return;
      }

      // Collect all fixed items and validate all open picks
      const allFixedRefs: { catalogName: string; quantity: number }[] = [];

      for (let groupIdx = 0; groupIdx < classDef.groups.length; groupIdx++) {
        const group = classDef.groups[groupIdx];
        const sel = se.selections[groupIdx];

        if (sel.optionIndex < 0 || sel.optionIndex >= group.options.length) {
          res.status(400).json({
            error: `Equipment group ${groupIdx}: optionIndex ${sel.optionIndex} out of range (0–${group.options.length - 1})`,
          });
          return;
        }

        const bundle = group.options[sel.optionIndex];

        // Fixed items in the chosen bundle
        for (const ref of bundle.items ?? []) {
          // Pack names are expanded later in resolveFixedItems
          allFixedRefs.push({ catalogName: ref.catalogName, quantity: ref.quantity ?? 1 });
        }

        // Open picks — validate each against its filter
        const openPicks = bundle.openPicks ?? [];
        const providedPicks = sel.openPicks ?? [];
        if (providedPicks.length !== openPicks.length) {
          res.status(400).json({
            error: `Equipment group ${groupIdx}, option ${sel.optionIndex}: expected ${openPicks.length} open picks, got ${providedPicks.length}`,
          });
          return;
        }

        for (let pickIdx = 0; pickIdx < openPicks.length; pickIdx++) {
          const pickFilter = openPicks[pickIdx].filter;
          const chosenName = providedPicks[pickIdx];

          // Look up the item in the catalog and validate it matches the filter
          const catalogItem = await prisma.item.findUnique({
            where: { name: chosenName },
            include: { weaponDetail: true },
          });

          if (!catalogItem || catalogItem.category !== "weapon") {
            res.status(400).json({
              error: `Open pick "${chosenName}" is not a known weapon in the catalog`,
            });
            return;
          }
          if (
            pickFilter.weaponClass &&
            catalogItem.weaponDetail?.weaponClass !== pickFilter.weaponClass
          ) {
            res.status(400).json({
              error: `Open pick "${chosenName}" does not satisfy filter: weaponClass must be "${pickFilter.weaponClass}"`,
            });
            return;
          }
          if (
            pickFilter.range &&
            catalogItem.weaponDetail?.weaponRange !== pickFilter.range
          ) {
            res.status(400).json({
              error: `Open pick "${chosenName}" does not satisfy filter: range must be "${pickFilter.range}"`,
            });
            return;
          }

          allFixedRefs.push({ catalogName: chosenName, quantity: openPicks[pickIdx].quantity ?? 1 });
        }
      }

      // Resolve all items (expands packs) into InventoryItem create payloads
      const { inventoryCreates, error } = await resolveFixedItems(allFixedRefs);
      if (error) {
        res.status(400).json({ error });
        return;
      }
      inventoryItemCreates = inventoryCreates;
    }
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
      // Override derived currency with starting gold if the gold path was chosen.
      ...(startingCurrency ? { currency: startingCurrency } : {}),
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
      ...(inventoryItemCreates.length > 0
        ? { inventoryItems: { create: inventoryItemCreates } }
        : {}),
    },
    include: characterInclude,
  });

  res.status(201).json(serializeCharacter(created));
});

// race/class/subclass/background are deliberately absent here — they're now
// relation-backed selections, not Character columns (see schema.prisma).
// level and proficiencyBonus are also absent — they're derived, never
// persisted, so .strict() rejects a client trying to set them directly
// instead of silently ignoring it. inventory is absent too, for a different
// reason: it's now InventoryItem rows, not a Json column, so a blind
// full-array PATCH can't express intent (acquired vs. consumed vs. sold) —
// see POST /api/characters/:id/inventory/transactions (Phase B) instead.
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
