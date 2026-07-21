/**
 * spellCast.ts — pure computation helpers for spell casting rolls.
 *
 * Extracted from SpellsSection.handleCast so session-mode components
 * (TurnHub's InlineSpellPicker) can produce the same roll without
 * duplicating the cantrip-scaling / upcast-dice / heal-modifier math.
 *
 * No React, no JSX, no side effects — output is deterministic given the inputs.
 */

import { rollSpec } from "@/lib/dice";
import { abilityModifier } from "@/lib/abilities";
import { readEffectSpec, resolveEffectSpec } from "@/lib/effects";
import { isAllyTarget, saveDcLabel, type Target } from "@/lib/spellMeta";
import type {
  AbilityName,
  CastSpellOperation,
  Character,
  Spell,
  SpellcastingOperation,
} from "@/types/character";
import type { RollSpec, RollResult } from "@/lib/dice";

// The inline result banner shown immediately after a cast.
export interface CastResult {
  spellName: string;
  total: number;
  diceStr: string;
  effectKind: "damage" | "heal";
  damageType?: string | null;
  slotLevel?: number;
}

// The ops to send + the banner to show for a cast — no React/state.
export interface CastPlan {
  ops: SpellcastingOperation[];
  result: CastResult | null;
}

// A cast produces a display banner only for damage/heal spells; buff/utility
// spells have no effect dice (computeCastRoll returns null).
function bannerFor(
  spell: Spell,
  roll: { spec: RollSpec; total: number },
  slotLevel: number | undefined,
): CastResult | null {
  if (spell.effectKind !== "damage" && spell.effectKind !== "heal") return null;
  return {
    spellName: spell.name,
    total: roll.total,
    diceStr: `${roll.spec.count}d${roll.spec.faces}`,
    effectKind: spell.effectKind,
    damageType: spell.damageType,
    slotLevel,
  };
}

// Item-granted spell (#528): cast from the item's own resource at its configured
// slot level (may upcast above the spell's base level), never a spell slot.
function planItemCast(spell: Spell, character: Character): CastPlan {
  const castLevel = spell.item?.castLevel ?? spell.level;
  const castRoll = computeCastRoll(spell, character, castLevel);
  const result = castRoll ? bannerFor(spell, castRoll, undefined) : null;
  return { ops: [{ type: "castItemSpell", entryId: spell.id, roll: castRoll?.total ?? 0 }], result };
}

// Plan a cast: which ops to send and whether to show a roll banner. Rolls dice
// via computeCastRoll but holds no React state — SpellsSection wires the result.
export function planCast(spell: Spell, character: Character, slotLevel?: number): CastPlan {
  if (spell.source === "item") return planItemCast(spell, character);

  const isCantrip = spell.level === 0;
  const resolvedSlotLevel = slotLevel ?? spell.level;
  const castRoll = computeCastRoll(spell, character, resolvedSlotLevel);

  if (!castRoll) {
    // No effect dice — just expend the slot (cantrips expend nothing).
    const ops: SpellcastingOperation[] = isCantrip
      ? []
      : [{ type: "castSpell", entryId: spell.id, slotLevel: resolvedSlotLevel, roll: 0 }];
    return { ops, result: null };
  }

  const result = bannerFor(spell, castRoll, isCantrip ? undefined : slotLevel);
  const op: CastSpellOperation = isCantrip
    ? { type: "castSpell", entryId: spell.id, roll: castRoll.total }
    : { type: "castSpell", entryId: spell.id, slotLevel: resolvedSlotLevel, roll: castRoll.total };
  return { ops: [op], result };
}

/**
 * Compute the dice spec for casting `spell` at `slotLevel` — pure, no side
 * effects and no actual rolling. Returns null when the spell has no effect
 * dice (e.g. a utility spell like Detect Magic).
 *
 *  - Cantrip scaling: ×2 at char level 5, ×3 at 11, ×4 at 17.
 *  - Upcast bonus: extraLevels × spell.upcastDicePerLevel added to diceCount.
 *  - Heal spells add the spellcasting ability modifier as a flat bonus.
 */
export function computeCastSpec(
  spell: Spell,
  character: Character,
  slotLevel: number,
): RollSpec | null {
  // Heal spells add the spellcasting ability modifier as a flat bonus.
  const ability = character.spellcasting?.ability;
  const abilityScore = ability
    ? (character.abilityScores[ability as AbilityName] ?? 10)
    : 10;
  const abilityMod = abilityModifier(abilityScore);

  const spec = readEffectSpec(spell);
  const effectiveStep = spell.level === 0 ? 0 : Math.max(0, slotLevel - spell.level);
  return resolveEffectSpec(spec, effectiveStep, { characterLevel: character.level, abilityMod });
}

// Roll the effect dice for casting `spell` at `slotLevel` — null when the spell
// has no effect dice. Internal to planCast; session mode uses computeCastSpec +
// RollContext.roll() so the result surfaces in the shared toast.
function computeCastRoll(
  spell: Spell,
  character: Character,
  slotLevel: number,
): { spec: RollSpec; total: number; result: RollResult } | null {
  const spec = computeCastSpec(spell, character, slotLevel);
  if (!spec) return null;
  const result = rollSpec(spec);
  return { spec, total: result.total, result };
}

// The remaining helpers below back InlineSpellPicker's session-mode cast flow
// (useSpellPicker.handleCast) — extracted so that function's branching stays
// readable instead of tripping fallow's complexity gate (#1163/#1164).

/** Where a cast's rolled effect applies: self HP, an ally's sheet (heal only,
 *  #462), or nothing (an off-sheet "other" target, or a spell with no roll). */
export function castApplyPayload(
  spell: Spell,
  target: Target,
  rollTotal: number,
  hasRoll: boolean,
): { target: "self" | { characterId: string }; kind: "heal" | "damage"; amount: number } | undefined {
  if (!hasRoll || !spell.effectKind) return undefined;
  if (target === "self") {
    return { target: "self", kind: spell.effectKind as "heal" | "damage", amount: rollTotal };
  }
  if (isAllyTarget(target)) {
    return { target: { characterId: target.characterId }, kind: "heal", amount: rollTotal };
  }
  return undefined;
}

/** The castSpell op for the session cast flow — cantrips omit slotLevel. */
export function castSpellOp(
  spell: Spell,
  effectiveSlot: number,
  rollTotal: number,
  apply: ReturnType<typeof castApplyPayload>,
): CastSpellOperation {
  return spell.level === 0
    ? { type: "castSpell", entryId: spell.id, roll: rollTotal, apply }
    : { type: "castSpell", entryId: spell.id, slotLevel: effectiveSlot, roll: rollTotal, apply };
}

/** The save DC / half-on-success line to read to the DM — the cast sheet's
 *  result-well "announce" line (#1164). Null when the cast doesn't force a save. */
export function castAnnounceLine(spell: Spell, spellSaveDC: number | undefined): string | null {
  if (spell.attackType !== "save" || spellSaveDC === undefined) return null;
  const dc = saveDcLabel(spell, spellSaveDC);
  if (!dc) return null;
  return spell.saveEffect === "half" ? `${dc}, half on success` : dc;
}

/**
 * The cast sheet's persistent result well (#1164): what the most recent cast
 * IN THIS SHEET produced. Kept until the next cast overwrites it or the sheet
 * closes — distinct from RollResultSeal's 2.2s transient toast, which still
 * fires alongside it via `roll()`.
 */
export interface CastSettleView {
  spellId: string;
  spellName: string;
  level: number;
  /** Kept die faces, for the well's dice row; empty when the cast had no roll. */
  dice: number[];
  total: number | null;
  damageType: string | null;
  announce: string | null;
}

export function buildCastSettle(
  spell: Spell,
  effectiveSlot: number,
  hasRoll: boolean,
  rollTotal: number,
  keptDice: number[],
  announce: string | null,
): CastSettleView {
  return {
    spellId: spell.id,
    spellName: spell.name,
    level: effectiveSlot,
    dice: keptDice,
    total: hasRoll ? rollTotal : null,
    damageType: spell.damageType ?? null,
    announce,
  };
}
