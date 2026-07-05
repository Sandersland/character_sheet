// 5e rules data: cantrips/spells a subclass grants for free (no player choice).
// These are pure-derived at serialize time and never persisted — the derived id
// scheme `granted:<subclass>:<spell>` is the seam a future side-table would key
// on if a stateful granted spell ever appears. Snapshotting granted content is a
// Phase-D versioning concern (introduced uniformly with spells/items), not by
// persisting grants ad-hoc.

import type { SpellEntry } from "./spell-state.js";

// The six ability scores, lowercase — the shape of Character.abilityScores.
export type AbilityScores = Record<
  "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma",
  number
>;

// A subclass-granted spell, keyed by lowercase subclass name. Each descriptor is
// a full SpellEntry snapshot (matching the catalog row shape) plus a stable id.
interface GrantedSpellRule {
  gateLevel: number;
  spells: SpellEntry[];
  // Casting ability the granted spells use for save DC / attack bonus.
  castingAbility: keyof AbilityScores;
}

const MINOR_ILLUSION: SpellEntry = {
  id: "granted:way-of-shadow:minor-illusion",
  name: "Minor Illusion",
  level: 0,
  school: "illusion",
  prepared: true,
  source: "subclass",
  castingTime: "1 action",
  range: "30 ft",
  duration: "1 minute",
  description:
    "Create a sound or an image of an object within range that lasts for the duration. The illusion ends if you dismiss it or cast this spell again. A creature that uses its action to examine the illusion can determine it is illusory with a successful Investigation check against your spell save DC.",
  components: { verbal: true, somatic: true, material: true, materialDescription: "a bit of fleece" },
};

const SUBCLASS_GRANTED_SPELLS: Record<string, GrantedSpellRule> = {
  "way of shadow": { gateLevel: 3, spells: [MINOR_ILLUSION], castingAbility: "wisdom" },
};

// Pure function: the spells a (subclass, level) grants for free. Below the gate
// level, or for a subclass with no grants, returns []. className is accepted for
// signature symmetry with the other derivers; the subclass key is unambiguous.
export function deriveGrantedSpells(
  _className: string,
  subclass: string | undefined,
  level: number,
): SpellEntry[] {
  if (!subclass) return [];
  const rule = SUBCLASS_GRANTED_SPELLS[subclass.toLowerCase()];
  if (!rule || level < rule.gateLevel) return [];
  return rule.spells.map((s) => ({ ...s, components: s.components ? { ...s.components } : s.components }));
}

// The casting ability a subclass's granted spells use (default Wisdom).
export function deriveGrantedCastingAbility(subclass: string | undefined): keyof AbilityScores {
  if (!subclass) return "wisdom";
  return SUBCLASS_GRANTED_SPELLS[subclass.toLowerCase()]?.castingAbility ?? "wisdom";
}
