/**
 * spellCast.ts — pure lookup/planning helpers for spell casting.
 *
 * `planCast` backs the out-of-session grimoire cast flow (SpellsSection /
 * useSpellcasting.ts). The in-session Cast-a-Spell picker moved onto the
 * shared resolver in #1833 (`spellToResolution`, `resolveAction`) and no
 * longer builds a `castSpell` op here — it still reuses `computeCastSpec`
 * (the served-roll lookup both surfaces share) and `castAnnounceLine`. The
 * dice math itself (cantrip scaling / upcast dice / heal ability-modifier)
 * resolves backend-side (#1381) — this module only looks up the served roll,
 * never re-derives it.
 *
 * No React, no JSX, no side effects — output is deterministic given the inputs.
 */

import { rollSpec } from "@/lib/dice";
import { saveDcLabel } from "@/lib/spellMeta";
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

/** The save DC / half-on-success line to read to the DM — the Cast-a-Spell
 *  resolver's cast-tally announce line (#1164, carried into #1833's
 *  onCastSettled). Null when the cast doesn't force a save. */
export function castAnnounceLine(spell: Spell, spellSaveDC: number | undefined): string | null {
  if (spell.attackType !== "save" || spellSaveDC === undefined) return null;
  const dc = saveDcLabel(spell, spellSaveDC);
  if (!dc) return null;
  return spell.saveEffect === "half" ? `${dc}, half on success` : dc;
}
