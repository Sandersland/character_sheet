import { prisma } from "@/lib/core/prisma.js";

/**
 * The subset of a homebrew spell submission validateCustomSpellCoherence
 * checks — matches customSpellSchema's (contracts) shape closely enough that
 * a route can pass its parsed body straight through.
 */
export interface CustomSpellCoherenceInput {
  level: number;
  effectKind?: "damage" | "heal";
  effectDiceCount?: number;
  effectDiceFaces?: number;
  attackType?: "attack" | "save";
  saveAbility?: string;
  saveEffect?: string;
}

/**
 * Pure structured-effect coherence checks for a homebrew spell (#1785, epic
 * #1782 2/5) — the SAME rules for both create and edit (custom-spells.ts's
 * POST and PATCH both call this one function on the full submitted record,
 * never two hand-rolled copies). Returns the first violation's message, or
 * null when the record is internally consistent. DB-dependent checks
 * (class-name validity) are NOT here — see validateCustomSpellClasses below.
 */
export function validateCustomSpellCoherence(input: CustomSpellCoherenceInput): string | null {
  if (input.level < 0 || input.level > 9) {
    return "level must be between 0 and 9";
  }
  if (
    input.effectKind !== undefined &&
    (input.effectDiceCount === undefined || input.effectDiceFaces === undefined)
  ) {
    return "effectDiceCount and effectDiceFaces are required when effectKind is set";
  }
  if (input.attackType === "save" && input.saveAbility === undefined) {
    return 'saveAbility is required when attackType is "save"';
  }
  if (
    input.attackType === "attack" &&
    (input.saveAbility !== undefined || input.saveEffect !== undefined)
  ) {
    return 'saveAbility/saveEffect must not be set when attackType is "attack"';
  }
  return null;
}

/**
 * Rejects a homebrew spell submission naming a class outside the
 * CharacterClass catalog. Case-insensitive: CharacterClass.name is
 * Capitalized ("Wizard"), SpellClass.className is stored lowercase
 * ("wizard", #1711) — this checks against the catalog regardless of the
 * caller's casing. Empty `classes` is valid (a spell with no class access
 * yet); returns the first unmatched name(s) in one message rather than
 * throwing per-name.
 */
export async function validateCustomSpellClasses(classes: string[]): Promise<string | null> {
  if (classes.length === 0) return null;

  const known = await prisma.characterClass.findMany({ select: { name: true } });
  const knownLower = new Set(known.map((c) => c.name.toLowerCase()));
  const unknown = classes.filter((c) => !knownLower.has(c.toLowerCase()));
  if (unknown.length > 0) {
    return `Unknown class(es): ${unknown.join(", ")}`;
  }
  return null;
}
