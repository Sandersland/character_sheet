/** `ownerId`/`edition` are server-forced and absent here — `.strict()` 400s a client that tries to set either, rather than silently ignoring it. */
/** One schema serves both POST and PATCH: PATCH is a full-field replace, not a partial merge. */
/** Cross-field coherence (dice fields, save requirements, class-name validity) is not expressed here — see `validateCustomSpellCoherence`, which the route calls after this schema's `.parse()`. */
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
    // Lowercase class names (SpellClass.className convention); may be empty.
    classes: z.array(z.string().min(1)),
    effectKind: z.enum(["damage", "heal"]).optional(),
    effectDiceCount: z.number().int().positive().optional(),
    effectDiceFaces: z.number().int().positive().optional(),
    effectModifier: z.number().int().optional(),
    damageType: z.string().min(1).optional(),
    attackType: z.enum(["attack", "save"]).optional(),
    saveAbility: z.enum(SAVE_ABILITIES).optional(),
    saveEffect: z.enum(["half", "none"]).optional(),
    upcastDicePerLevel: z.number().int().positive().optional(),
    // Multi-instance fields (#1981/#1984) — see EffectColumns. Cross-field coherence
    // (instanceRoll/upcastInstancesPerLevel require instanceCount, no upcastInstancesPerLevel on
    // a cantrip) lives in validateCustomSpellCoherence, not here — same split as the rest of this
    // schema's cross-field rules (see the file header comment).
    instanceCount: z.number().int().positive().optional(),
    instanceRoll: z.enum(["each", "once"]).optional(),
    upcastInstancesPerLevel: z.number().int().positive().optional(),
  })
  .strict();
export type CustomSpellInput = z.input<typeof customSpellSchema>;
