import { z } from "zod";

// The AbilityIncreaseSpec vocabulary for Species.abilityIncreases /
// SpeciesVariant.abilityIncreases (#1679, epic #1518 design Part 3). Three
// forms, because PHB'14 alone needs all three and a later-printing row (e.g.
// Astral Elf) must slot in without a migration:
//   - fixed:    a named ability always gets +amount (Dwarf's +2 CON).
//   - choose:   pick `count` distinct abilities (optionally restricted to
//               `from`) and add +amount to each (Half-Elf's "+1 to two of
//               your choice").
//   - floating: a raw point pool the player assigns however they like across
//               distinct abilities, no fixed ability named at all (Astral
//               Elf's +2/+1-or-+1/+1/+1 — the same shape #1572's background
//               spread validator already handles, reused rather than
//               reinvented in #1681).
// Species and SpeciesVariant increases are ADDITIVE at creation (Hill Dwarf's
// +1 WIS on top of Dwarf's own +2 CON) — merging the two levels is #1681's
// job; this slice only validates and persists the spec, never applies it.
//
// [] for every EDITION_2024 row: 2024 ability increases come from backgrounds
// only (#1572), never species — enforced by a negative test in both
// directions (species-ability-increases.test.ts), not by this schema (an
// empty array is valid for a 2014 row too, e.g. Human's six separate +1
// fixed entries look nothing like "no increases", so the schema can't tell
// "2024 species" apart from "2014 species with a genuinely empty spec").
const ABILITY_NAMES = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
] as const;

const fixedIncreaseSchema = z
  .object({
    ability: z.enum(ABILITY_NAMES),
    amount: z.number().int().positive(),
  })
  .strict();

const chooseIncreaseSchema = z
  .object({
    choose: z
      .object({
        count: z.number().int().positive(),
        amount: z.number().int().positive(),
        // Omitted = any of the six abilities is eligible. Half-Elf restricts
        // this to the five NON-Charisma abilities (Charisma is already its
        // fixed +2), so `from` exists from day one rather than being added
        // when the first restricted-choose row lands.
        from: z.array(z.enum(ABILITY_NAMES)).min(1).optional(),
      })
      .strict(),
  })
  .strict();

const floatingIncreaseSchema = z
  .object({
    floating: z.number().int().positive(),
  })
  .strict();

// Not exported: no cross-file consumer needs the single-entry schema, only
// the array (abilityIncreasesSchema below) — same unused-export reasoning as
// AbilityName above.
const abilityIncreaseSpecSchema = z.union([
  fixedIncreaseSchema,
  chooseIncreaseSchema,
  floatingIncreaseSchema,
]);

export const abilityIncreasesSchema = z.array(abilityIncreaseSpecSchema);

export type AbilityIncreaseSpec = z.infer<typeof abilityIncreaseSpecSchema>;
