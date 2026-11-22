import { z } from "zod";

import { ALL_RULES_EDITIONS } from "@/lib/rules/edition.js";
import { ALL_ABILITY_GENERATION_METHODS } from "@/lib/srd/ability-generation.js";

const abilityScoresSchema = z
  .object({
    strength: z.number().int(),
    dexterity: z.number().int(),
    constitution: z.number().int(),
    intelligence: z.number().int(),
    wisdom: z.number().int(),
    charisma: z.number().int(),
  })
  .strict();

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
    // How the player produced abilityScores below — validateAbilityScores checks
    // the scores against the matching rule (standardArray/pointBuy: PHB'14 p.13 /
    // SRD 5.2's standard array and point-buy rules; roll: the 3-18 dice-math bound);
    // an omitted or "manual" method gets only the wider 1-30 sanity bound, never
    // zero validation.
    abilityGenerationMethod: z.enum(ALL_ABILITY_GENERATION_METHODS).optional(),
    backgroundAbilities: z.record(z.string(), z.number().int().positive()).optional(),
    skillProficiencies: z.array(z.string()).optional(),
    toolChoices: z.array(z.string()).optional(),
    backgroundToolChoices: z.array(z.string()).optional(),
    startingEquipment: startingEquipmentSchema.optional(),
    backgroundStartingEquipment: startingEquipmentSchema.optional(),
    spells: z
      .object({ cantripIds: z.array(z.string()), spellIds: z.array(z.string()) })
      .optional(),
    // Never a literal array (#1527) — a third edition becomes settable the moment RulesEdition gains it.
    rulesEdition: z.enum(ALL_RULES_EDITIONS).optional(),
  })
  .strict();

export type CreateCharacterBody = z.infer<typeof createCharacterSchema>;

// Everything else (tracked game state included) is mutated only through its own transaction/REST
// endpoint (never a blind PATCH) — .strict() 400s an attempt instead of silently ignoring it.
// rulesEdition is write-once (#1281). currency stays patchable; the handler logs a currencyAdjust event in the same transaction.
// portraitUrl is absent (#1615): PATCH writing an arbitrary URL was the IDOR the dedicated upload/delete endpoints close.
export const updateCharacterSchema = z
  .object({
    name: z.string().min(1),
    alignment: z.string().min(1),
    currency: z.object({
      cp: z.number().int().nonnegative(),
      sp: z.number().int().nonnegative(),
      gp: z.number().int().nonnegative(),
      pp: z.number().int().nonnegative(),
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
