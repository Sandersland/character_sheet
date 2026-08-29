import { z } from "zod";

import { ALL_RULES_EDITIONS } from "@/lib/rules/edition.js";

const abilityScoresSchema = z.object({
  strength: z.number().int(),
  dexterity: z.number().int(),
  constitution: z.number().int(),
  intelligence: z.number().int(),
  wisdom: z.number().int(),
  charisma: z.number().int(),
});

const classChoiceSchema = z.object({
  name: z.string().min(1),
  subclass: z.string().nullable().optional(),
  subclassId: z.string().optional(),
});

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

export const createCharacterSchema = z
  .object({
    name: z.string().min(1),
    alignment: z.string().min(1),
    experiencePoints: z.number().int().nonnegative().optional(),
    speciesId: z.string().min(1),
    variantId: z.string().optional(),
    speciesAbilities: z.record(z.string(), z.number().int().positive()).optional(),
    castingAbility: z.enum(["intelligence", "wisdom", "charisma"]).optional(),
    speciesSkills: z.array(z.string()).optional(),
    speciesCantripId: z.string().optional(),
    speciesOriginFeatId: z.string().optional(),
    background: z.string().min(1),
    classes: z.array(classChoiceSchema).length(1),
    abilityScores: abilityScoresSchema,
    backgroundAbilities: z.record(z.string(), z.number().int().positive()).optional(),
    skillProficiencies: z.array(z.string()).optional(),
    toolChoices: z.array(z.string()).optional(),
    backgroundToolChoices: z.array(z.string()).optional(),
    startingEquipment: startingEquipmentSchema.optional(),
    backgroundStartingEquipment: startingEquipmentSchema.optional(),
    spells: z
      .object({ cantripIds: z.array(z.string()), spellIds: z.array(z.string()) })
      .optional(),
    // Derives from ALL_RULES_EDITIONS (#1527), never a literal array — a third edition becomes settable here the moment it's added to RulesEdition.
    rulesEdition: z.enum(ALL_RULES_EDITIONS).optional(),
  })
  .strict();

export type CreateCharacterBody = z.infer<typeof createCharacterSchema>;

// race/class/subclass/background/level/proficiencyBonus/experiencePoints/rulesEdition/inventory/spellcasting/journal are deliberately absent: derived, relation-backed, or mutated only through their own transaction/REST endpoint (never a blind PATCH) — .strict() 400s an attempt instead of silently ignoring it. rulesEdition is write-once (#1281).
// currency IS still patchable here; the handler logs a currencyAdjust event in the same transaction.
export const updateCharacterSchema = z
  .object({
    name: z.string().min(1),
    alignment: z.string().min(1),
    // portraitUrl is absent (#1615): PATCH writing an arbitrary URL was the IDOR the dedicated upload/delete endpoints close.
    initiativeBonus: z.number().int(),
    speed: z.number().int().nonnegative(),
    hitPoints: z.object({
      current: z.number().int(),
      max: z.number().int(),
      temp: z.number().int(),
      deathSaves: z.object({
        successes: z.number().int().min(0).max(3),
        failures: z.number().int().min(0).max(3),
      }).optional(),
    }),
    hitDice: z.object({
      total: z.number().int(),
      die: z.string(),
      spent: z.number().int().min(0).optional(),
    }),
    abilityScores: z.record(z.string(), z.number().int()),
    savingThrowProficiencies: z.array(z.string()),
    skills: z.array(z.unknown()),
    currency: z.object({
      cp: z.number().int(),
      sp: z.number().int(),
      gp: z.number().int(),
      pp: z.number().int(),
    }),
  })
  .partial()
  .strict();

export const campaignPreferencesSchema = z
  .object({
    shareWithDm: z.boolean(),
    autoFriendlyHealing: z.boolean(),
  })
  .partial()
  .strict();
