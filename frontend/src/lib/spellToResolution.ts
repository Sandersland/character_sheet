// spellToResolution (epic #1827 Slice 6, #1833) — the spell half of the
// shared TurnResolution descriptor; weaponToResolution.ts is the reference
// pattern. Every number is copied verbatim off values the serializer already
// decorated onto the spell entry (decorateSpellEffects, #1381/#1828) or the
// character's own spellcasting view — spellAttackBonus/spellSaveDC,
// effectRolls[slotLevel]'s dice spec, castCost — never re-derived (CLAUDE.md:
// rules logic is backend-owned).
//
// A spell attack is never a weapon swing or Unarmed Strike, so Champion's
// crit-range widening never applies (#1120, mirrors InlineSpellAttackSection's
// pre-#1833 comment) — critRange is always the literal 20, unlike
// weaponToResolution's served character.critRange.
//
// Shape per spell.attackType/effectKind (design spec's four/five shapes):
//   - attackType "attack"  → toHit (Fire Bolt, Chromatic Orb).
//   - attackType "save"    → save, when the spell also carries its own
//     saveAbility (Sacred Flame).
//   - neither, but a served effectRolls entry exists → auto-hit, effect only
//     (Magic Missile) — no target model to roll a d20 against.
//   - neither, no effectRolls entry at this level → no-roll utility
//     (Druidcraft) or a buff (Mage Armor) — a buff spell applies itself
//     server-side purely off the op's `entryId`, nothing in this descriptor.
// `effect.kind` is "heal" for a heal spell (drives the rail's heal labels,
// #1831 review) and omits `damageType` — "healing" is a display fallback,
// never a real 5e damage type (mirrors buildEffectEvent's own contract,
// useResolution.ts).

import { computeCastSpec } from "@/lib/spellCast";
import type { TurnResolution, TurnResolutionCostKind } from "@character-sheet/shared-types";
import type { Spell } from "@/types/character";

// Fixed invariant, not a derived value (#1848 review): SRD 5.1/5.2 both scope
// crit-range-widening feats (Champion's Improved/Superior Critical) to
// "weapon attacks and Unarmed Strikes" only — a spell attack is categorically
// excluded, for every character, in both editions, with no mechanism in
// either ruleset that ever changes it. That's exactly why this is a literal
// 20 here and NOT a served `character.critRange` the way weaponToResolution
// reads one: critRange is a per-CHARACTER derived number for weapons (a
// Champion's own feature widens it), but for a spell attack it is a
// per-RULE constant with no character-specific input to derive from — there
// is no `spellCritRange` for the backend to serve because there is no case
// where it would ever read differently. If a future rule ever DID grant a
// wider spell-attack crit range, that would be new backend-derived state
// (deriveSpellcasting or similar) served the same way spellAttackBonus is —
// this constant is not a substitute for that seam, it is what stands here
// today because the seam has never been needed.
const SPELL_CRIT_RANGE = 20;

const SPELL_COST_KIND: Record<"action" | "bonusAction" | "reaction", TurnResolutionCostKind> = {
  action: "action",
  bonusAction: "bonusAction",
  reaction: "reaction",
};

/** The served spellcasting stats a resolution's toHit/save read — never
 *  re-derived (deriveSpellcasting, backend-owned). */
export interface SpellcastingResolutionStats {
  spellAttackBonus?: number;
  spellSaveDC?: number;
}

// Each `TurnResolution` member below is its own small function — split out of
// spellToResolution (#1848 review: the inline ternary chain, plus the
// isUnannounceableSave guard, pushed the composed function over fallow's
// cognitive-complexity threshold) so every branch lives in a single-purpose
// helper instead of one large conditional spread.

function costKindFor(spell: Spell): TurnResolutionCostKind {
  return spell.castCost && spell.castCost in SPELL_COST_KIND
    ? SPELL_COST_KIND[spell.castCost as keyof typeof SPELL_COST_KIND]
    : "action";
}

function toHitFor(spell: Spell, stats: SpellcastingResolutionStats): TurnResolution["toHit"] {
  if (spell.attackType !== "attack") return undefined;
  return { bonus: stats.spellAttackBonus ?? 0, critRange: SPELL_CRIT_RANGE };
}

function saveFor(spell: Spell, stats: SpellcastingResolutionStats): TurnResolution["save"] {
  if (spell.attackType !== "save" || !spell.saveAbility) return undefined;
  return { dc: stats.spellSaveDC ?? 0, ability: spell.saveAbility };
}

// `spec` is `computeCastSpec`'s served roll (null for a no-roll/buff spell).
// A "save"-type spell with no saveAbility is a data-integrity violation, not
// a legal spell shape (#1848 review): `assertValidCustomSpell`
// (custom-spell-validation.ts) requires saveAbility whenever a homebrew
// spell's attackType is "save", and every seeded catalog save spell sets it
// by the same convention — this branch should be unreachable in practice. It
// is guarded anyway because the alternative silent behavior is actively
// dangerous: with `save` omitted (saveFor above), the resolution would still
// carry `effect` and present as an AUTO-HIT (Magic Missile shape) — real
// damage rolled and (if applied) dealt with the target never given a save
// prompt at all. Suppressing `effect` too, rather than only `save`, keeps a
// broken-data cast inert (source + cost only, no rolled/appliable effect)
// instead of silently skipping the save the catalog data itself requires.
function effectFor(spell: Spell, spec: ReturnType<typeof computeCastSpec>): TurnResolution["effect"] {
  const isUnannounceableSave = spell.attackType === "save" && !spell.saveAbility;
  if (!spec || isUnannounceableSave) return undefined;
  return {
    // AttackRollSpec's `modifier` is required (unlike RollSpec's optional
    // one, weaponToResolution's damageSpec always carries a real number too)
    // — computeCastSpec's served roll always sets it, but default to 0
    // rather than widen the descriptor's type.
    spec: { count: spec.count, faces: spec.faces, modifier: spec.modifier ?? 0 },
    kind: spell.effectKind === "heal" ? "heal" : "damage",
    ...(spell.effectKind !== "heal" && spell.damageType ? { damageType: spell.damageType } : {}),
  };
}

export function spellToResolution(
  spell: Spell,
  slotLevel: number,
  stats: SpellcastingResolutionStats,
): TurnResolution {
  const toHit = toHitFor(spell, stats);
  const save = saveFor(spell, stats);
  const effect = effectFor(spell, computeCastSpec(spell, slotLevel));

  return {
    source: spell.name,
    cost: { kind: costKindFor(spell) },
    ...(toHit ? { toHit } : {}),
    ...(save ? { save } : {}),
    ...(effect ? { effect } : {}),
  };
}
