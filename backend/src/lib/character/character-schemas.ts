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
  // Catalog subclass FK — only legal when the class's EDITION-RESOLVED gate is
  // creation level (2014 Cleric/Sorcerer/Warlock L1, #1308); resolveSubclass
  // rejects it otherwise (e.g. the same classes under 2024, gate 3). Null/absent
  // for classes whose subclass is chosen post-creation (Fighter L3, etc.).
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
    // portraitUrl is absent (#1616, closing #1615's interim): portraits are
    // uploaded blobs keyed by Character.portraitKey, never client-supplied
    // URLs — the create UI stages a file and uploads it via portraitRouter
    // after create; .strict() 400s any client still sending a URL.
    experiencePoints: z.number().int().nonnegative().optional(),
    // Species catalog FK (#1679) — the mechanical anchor since #1684 pruned
    // the flat `Race` model/legacy `race`-name path. Validated in
    // resolveSpeciesSelection: variant must belong to this species, species
    // edition must match the character's, and a variant-bearing species
    // requires variantId iff the species has variant rows. variantId is
    // REJECTED without a speciesId (never implies one).
    speciesId: z.string().min(1),
    variantId: z.string().optional(),
    // 2014 species/subrace ability increases (#1681): the CHOSEN portion only
    // (fixed increases are applied server-side with no request field, same
    // as fixed tool profs above). Required iff the merged species+variant
    // abilityIncreases spec has a choose/floating component; 400 under
    // EDITION_2024 (mirrors backgroundAbilities' 2024-only gate below, in the
    // other direction) and when the merged spec is fixed-only — see
    // resolveSpeciesGrants in character-create.ts.
    speciesAbilities: z.record(z.string(), z.number().int().positive()).optional(),
    // 2024 lineage/legacy casting-ability choice (#1683): the Int/Wis/Cha
    // ability a spell-granting lineage (Elf's Drow/High Elf/Wood Elf, Gnome's
    // Forest/Rock, Tiefling's Abyssal/Chthonic/Infernal) uses, chosen "when
    // you select the lineage" (PHB'24). Required iff the resolved species+
    // variant's merged SpeciesGrantedSpell rows are non-empty; 400 otherwise
    // (submitted with no species, or a species/variant that grants nothing)
    // — see resolveCastingAbility in character-create.ts.
    castingAbility: z.enum(["intelligence", "wisdom", "charisma"]).optional(),
    // #1689: the species/variant's OWN creation choices (SpeciesTrait.choice) —
    // distinct from skillProficiencies/spells below, which are the class/
    // background pools. Required iff the resolved species+variant carries a
    // matching choice-bearing trait; 400 otherwise — a 2014 species without
    // one, or a 2024 species other than the Human/Elf choice traits #1690 added
    // (the mechanism is edition-neutral). See resolveSpeciesChoiceGrants in
    // character-create.ts.
    speciesSkills: z.array(z.string()).optional(),
    speciesCantripId: z.string().optional(),
    // #1690: the species-granted Origin feat pick (2024 Human's Versatile) —
    // sibling of speciesCantripId above, same "required iff the resolved
    // species+variant carries the matching choice-bearing trait" rule.
    // Validated as an Origin-category Feat and baked via the SAME slot-exempt
    // snapshot AdvancementEntry path the background's own Origin feat uses
    // (buildOriginEntry) — see resolveSpeciesOriginFeatGrant in character-create.ts.
    speciesOriginFeatId: z.string().optional(),
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
    /** #1779: tool names chosen by the player at creation from the
     *  BACKGROUND's own toolChoices pool (PHB'14/PHB'24 Soldier/Noble's "one
     *  type of gaming set") — a SEPARATE pick with its own cap from
     *  toolChoices above (Background mirrors CharacterClass's toolChoices/
     *  toolChoiceCount columns exactly); fixed grants stay in
     *  background.toolProficiencies, applied server-side with no request field. */
    backgroundToolChoices: z.array(z.string()).optional(),
    startingEquipment: startingEquipmentSchema.optional(),
    // #1565: the background's OWN equipment package, resolved by
    // (backgroundId, edition) alongside the class one above — a background
    // never has a roll-for-gold dice alternative in either edition (unlike a
    // 2014 class), so this reuses the SAME discriminated schema rather than a
    // package-only one; materializeStartingEquipment 400s a "gold" mode here
    // exactly as resolveStartingGold already does for a null-dice CLASS
    // package. Omitted (not required) for a homebrew/unresolved background or
    // one with no package under this edition (any 2014 background but Acolyte
    // and Folk Hero).
    backgroundStartingEquipment: startingEquipmentSchema.optional(),
    // #1131: a level-1 caster's chosen cantrips + prepared spells (catalog ids).
    // Optional for back-compat; strictly count/list/level-validated when present.
    spells: z
      .object({ cantripIds: z.array(z.string()), spellIds: z.array(z.string()) })
      .optional(),
    // #1285: the only endpoint that may set a character's edition (write-once).
    // Optional — omitting it takes the Character.rulesEdition column default,
    // which stays the single source of that default. The picker is #1286.
    rulesEdition: z.enum(["EDITION_2014", "EDITION_2024"]).optional(),
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
// rulesEdition is absent because a character's edition is irreversible after
// creation (#1281, 2026-07-25) — set by the create transaction and never again,
// which is what lets every LEVEL_GATED_RECONCILERS entry treat it as a constant.
// .strict() therefore 400s an attempt rather than silently ignoring it, exactly
// as for level/experiencePoints.
//
// currency IS still patchable here (a bare DM-handed-over amount isn't
// economically categorised as a buy/sell/etc.); the handler writes a
// currencyAdjust event in the same transaction.
export const updateCharacterSchema = z
  .object({
    name: z.string().min(1),
    alignment: z.string().min(1),
    // portraitUrl is absent since #1615: the wire field is read-only, derived
    // from Character.portraitKey, and the portrait is mutated only via the
    // dedicated upload/delete endpoints (portraitRouter). Letting PATCH write
    // an arbitrary URL was the IDOR the upload pipeline closes; .strict()
    // 400s any attempt.
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
