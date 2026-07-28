/**
 * spellCast.ts — pure lookup/planning helpers for spell casting.
 *
 * Extracted from SpellsSection.handleCast so session-mode components
 * (TurnHub's InlineSpellPicker) share one cast plan. The dice math itself
 * (cantrip scaling / upcast dice / heal ability-modifier) resolves
 * backend-side (#1381) — this module only looks up the served roll and
 * shapes the op + banner, so both surfaces stay byte-identical for free.
 *
 * No React, no JSX, no side effects — output is deterministic given the inputs.
 */

import { rollSpec } from "@/lib/dice";
import { isAllyTarget, saveDcLabel, type Target } from "@/lib/spellMeta";
import type {
  CastSpellOperation,
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
function planItemCast(spell: Spell): CastPlan {
  const castLevel = spell.item?.castLevel ?? spell.level;
  const castRoll = computeCastRoll(spell, castLevel);
  const result = castRoll ? bannerFor(spell, castRoll, undefined) : null;
  return { ops: [{ type: "castItemSpell", entryId: spell.id, roll: castRoll?.total ?? 0 }], result };
}

// Plan a cast: which ops to send and whether to show a roll banner. Rolls dice
// via computeCastRoll but holds no React state — SpellsSection wires the result.
export function planCast(spell: Spell, slotLevel?: number): CastPlan {
  if (spell.source === "item") return planItemCast(spell);

  const isCantrip = spell.level === 0;
  const resolvedSlotLevel = slotLevel ?? spell.level;
  const castRoll = computeCastRoll(spell, resolvedSlotLevel);

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
 * The dice spec for casting `spell` at `slotLevel` — a lookup into the spell's
 * served `effectRolls` (#1381), not a re-derivation. The rules (cantrip
 * scaling, upcast dice, heal ability-modifier) resolve backend-side in
 * buildSpellcastingView; this only finds the entry keyed by the slot level the
 * player picked. Returns null when the spell has no served roll at that level
 * (a utility spell, or a level with no matching effectRolls entry).
 *
 * Hands back a COPY of the served roll: the entry lives in shared react-query
 * cache state, and callers (e.g. InlineSpellAttackSection's crit path) mutate
 * their local copy (`{ ...spec, crit: true }`) rather than the cached object.
 */
export function computeCastSpec(spell: Spell, slotLevel: number): RollSpec | null {
  const entry = spell.effectRolls?.find((e) => e.slotLevel === slotLevel);
  return entry ? { ...entry.roll } : null;
}

// Roll the effect dice for casting `spell` at `slotLevel` — null when the spell
// has no effect dice. Internal to planCast; session mode uses computeCastSpec +
// RollContext.roll() so the result surfaces in the shared toast.
function computeCastRoll(
  spell: Spell,
  slotLevel: number,
): { spec: RollSpec; total: number; result: RollResult } | null {
  const spec = computeCastSpec(spell, slotLevel);
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
