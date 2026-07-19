import { z } from "zod";

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
  // Catalog subclass FK — required when the class grants its subclass at
  // creation level (Cleric L1, Sorcerer L1, Warlock L1). Null/absent for
  // classes whose subclass is chosen post-creation (Fighter L3, etc.).
  subclassId: z.string().optional(),
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

export const createCharacterSchema = z
  .object({
    name: z.string().min(1),
    alignment: z.string().min(1),
    portraitUrl: z.string().nullable().optional(),
    experiencePoints: z.number().int().nonnegative().optional(),
    race: z.string().min(1),
    background: z.string().min(1),
    classes: z.array(classChoiceSchema).length(1),
    abilityScores: abilityScoresSchema,
    // PHB'24 background ability spread (#1130): a partial ability→bump map
    // (2+1 or 1+1+1 over the background's three abilityChoices). Shape/legality
    // is validated in resolveBackgroundGrants; optional here so a custom or
    // spec-less background can omit it (the frontend requires it when specced).
    backgroundAbilities: z.record(z.string(), z.number().int().positive()).optional(),
    skillProficiencies: z.array(z.string()).optional(),
    /** Tool names chosen by the player at creation (class choices only —
     *  fixed grants from background/class/race are applied server-side). */
    toolChoices: z.array(z.string()).optional(),
    startingEquipment: startingEquipmentSchema.optional(),
    // #1131: a level-1 caster's chosen cantrips + prepared spells (catalog ids).
    // Optional for back-compat; strictly count/list/level-validated when present.
    spells: z
      .object({ cantripIds: z.array(z.string()), spellIds: z.array(z.string()) })
      .optional(),
  })
  .strict();

// The HTTP body type — inferred from the zod contract above and consumed by
// the createCharacter orchestrator (type-only import, no runtime edge).
export type CreateCharacterBody = z.infer<typeof createCharacterSchema>;

// race/class/subclass/background are deliberately absent here — they're now
// relation-backed selections, not Character columns (see schema.prisma).
// level and proficiencyBonus are also absent — they're derived, never
// persisted, so .strict() rejects a client trying to set them directly
// instead of silently ignoring it. inventory is absent too, for a different
// reason: it's now InventoryItem rows, not a Json column, so a blind
// full-array PATCH can't express intent (acquired vs. consumed vs. sold) —
// see POST /api/characters/:id/inventory/transactions instead.
//
// experiencePoints is also absent here — XP changes must go through
// POST /api/characters/:id/experience so they are
// logged to the activity timeline and auto-reverse HP on level-down.
//
// currency IS still patchable here (a bare DM-handed-over amount isn't
// economically categorised as a buy/sell/etc.); the handler writes a
// currencyAdjust event in the same transaction.
export const updateCharacterSchema = z
  .object({
    name: z.string().min(1),
    alignment: z.string().min(1),
    portraitUrl: z.string().nullable(),
    // armorClass is absent: it's derived at read time from equipped armor + Dex + shield.
    initiativeBonus: z.number().int(),
    speed: z.number().int().nonnegative(),
    hitPoints: z.object({
      current: z.number().int(),
      max: z.number().int(),
      temp: z.number().int(),
      // Optional so callers that don't know about death saves can still PATCH
      // without stripping the field; normalizeHitPoints handles the default.
      deathSaves: z.object({
        successes: z.number().int().min(0).max(3),
        failures: z.number().int().min(0).max(3),
      }).optional(),
    }),
    hitDice: z.object({
      total: z.number().int(),
      die: z.string(),
      // Optional for the same backward-compat reason as deathSaves above.
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
    // spellcasting is intentionally absent: mutate via
    // POST /characters/:id/spellcasting/transactions instead, so that slot
    // expenditure and spell changes are logged as events (same reasoning as
    // inventory being absent from PATCH).
    //
    // journal is also absent: it's now the relational JournalEntry table,
    // mutated via the plain-REST /characters/:id/journal CRUD endpoints, not PATCH.
  })
  .partial()
  .strict();

// Campaign-scoped play preferences (#537). PATCH-style partial: only the sent
// flags are updated; omitted ones keep their current (or default) value.
export const campaignPreferencesSchema = z
  .object({
    shareWithDm: z.boolean(),
    autoFriendlyHealing: z.boolean(),
  })
  .partial()
  .strict();
