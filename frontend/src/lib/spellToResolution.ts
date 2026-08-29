// Every number here is copied verbatim off values the serializer already
// decorated onto the spell entry or the character's own spellcasting view —
// never re-derived (CLAUDE.md: rules logic is backend-owned). Shape per
// spell.attackType/effectKind: "attack" → toHit; "save" (with saveAbility) →
// save; no attackType but a served effectRolls entry → auto-hit, effect only
// (no target model to roll a d20 against); neither → no-roll utility or a buff
// applying itself server-side off the op's entryId. `effect.kind` is "heal" for
// a heal spell and omits `damageType` — "healing" is a display fallback, never
// a real 5e damage type (mirrors buildEffectEvent's contract, useResolution.ts).

import { computeCastSpec } from "@/lib/spellCast";
import type { TurnResolution, TurnResolutionCostKind } from "@character-sheet/shared-types";
import type { Spell } from "@/types/character";

// SRD 5.1/5.2 both scope crit-range-widening feats (Champion's Improved/Superior
// Critical) to "weapon attacks and Unarmed Strikes" only, so unlike
// weaponToResolution's served character.critRange, a spell attack's crit range
// is a fixed rule constant with no character-specific input to derive (#1848 review).
const SPELL_CRIT_RANGE = 20;

const SPELL_COST_KIND: Record<"action" | "bonusAction" | "reaction", TurnResolutionCostKind> = {
  action: "action",
  bonusAction: "bonusAction",
  reaction: "reaction",
};

export interface SpellcastingResolutionStats {
  spellAttackBonus?: number;
  spellSaveDC?: number;
}

// Split out of spellToResolution (#1848 review) to keep it under fallow's
// cognitive-complexity threshold.
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

// A "save"-type spell with no saveAbility should be unreachable in practice —
// assertValidCustomSpell requires saveAbility whenever attackType is "save",
// and every seeded catalog save spell follows the same convention (#1848
// review) — but it's guarded anyway: leaving `save` omitted while still
// carrying `effect` would present as an AUTO-HIT (Magic Missile shape), real
// damage dealt with no save prompt ever shown. Suppressing `effect` too keeps
// a broken-data cast inert instead of silently skipping the required save.
function effectFor(spell: Spell, spec: ReturnType<typeof computeCastSpec>): TurnResolution["effect"] {
  const isUnannounceableSave = spell.attackType === "save" && !spell.saveAbility;
  if (!spec || isUnannounceableSave) return undefined;
  return {
    // computeCastSpec's served roll always sets modifier, but AttackRollSpec
    // requires it (unlike RollSpec's optional one) so default to 0 rather
    // than widen the descriptor's type.
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
