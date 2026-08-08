/**
 * User-owned homebrew spell CRUD request schema (#1785, epic #1782 2/5) for
 * `backend/src/routes/catalog/custom-spells.ts`. Plain-REST like
 * campaign-ops.ts's schemas, not a transaction-op union: a homebrew spell is
 * shared catalog content across all of a user's characters, not one
 * character's mutable state.
 *
 * `ownerId`/`edition` are server-forced (POST always writes the caller's id
 * + "EDITION_2014") and deliberately absent from this schema — `.strict()`
 * means a client attempting to set either 400s rather than being silently
 * ignored.
 *
 * ONE schema serves both POST and PATCH: PATCH is a full-field replace, not
 * a partial merge (see custom-spells.ts's file banner for why) — the same
 * shape covers the create and edit routes.
 *
 * Cross-field coherence (effectKind ⇒ dice fields required, attackType
 * "save" ⇒ saveAbility required, "attack" ⇒ no save fields, level 0-9, and
 * class-name validity against the CharacterClass catalog) is a 5e-rule
 * concern, not a shape concern, so it is NOT expressed here — see
 * `backend/src/lib/spellcasting/custom-spell-validation.ts`, which the route
 * calls after this schema's `.parse()` (CLAUDE.md: rules logic is
 * backend-owned, in `lib/`).
 */
import { z } from "zod";

export const SPELL_SCHOOLS = [
  "abjuration",
  "conjuration",
  "divination",
  "enchantment",
  "evocation",
  "illusion",
  "necromancy",
  "transmutation",
] as const;

const SAVE_ABILITIES = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
] as const;

const customSpellComponentsSchema = z
  .object({
    verbal: z.boolean(),
    somatic: z.boolean(),
    material: z.boolean(),
    materialDescription: z.string().optional(),
  })
  .strict();

export const customSpellSchema = z
  .object({
    name: z.string().min(1),
    level: z.number().int(),
    school: z.enum(SPELL_SCHOOLS),
    castingTime: z.string().min(1),
    range: z.string().min(1),
    duration: z.string().min(1),
    description: z.string().min(1),
    concentration: z.boolean().optional(),
    ritual: z.boolean().optional(),
    components: customSpellComponentsSchema.optional(),
    // Lowercase class names (SpellClass.className convention, #1711) — may be
    // empty (a spell with no class access yet).
    classes: z.array(z.string().min(1)),
    // Utility spells carry none of the fields below; validateCustomSpellCoherence
    // enforces which combinations are legal, not this schema.
    effectKind: z.enum(["damage", "heal"]).optional(),
    effectDiceCount: z.number().int().positive().optional(),
    effectDiceFaces: z.number().int().positive().optional(),
    effectModifier: z.number().int().optional(),
    damageType: z.string().min(1).optional(),
    attackType: z.enum(["attack", "save"]).optional(),
    saveAbility: z.enum(SAVE_ABILITIES).optional(),
    saveEffect: z.enum(["half", "none"]).optional(),
    upcastDicePerLevel: z.number().int().positive().optional(),
  })
  .strict();
export type CustomSpellInput = z.input<typeof customSpellSchema>;
