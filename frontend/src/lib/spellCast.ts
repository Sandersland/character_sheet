// Pure lookup/planning helpers for spell casting; casts read the backend-served
// roll (#1381) and never re-derive dice math.
import { rollSpec } from "@/lib/dice";
import { saveDcLabel } from "@/lib/spellMeta";
import type {
  CastSpellOperation,
  Spell,
  SpellcastingOperation,
} from "@/types/character";
import type { RollSpec, RollResult } from "@/lib/dice";

export interface CastResult {
  spellName: string;
  total: number;
  diceStr: string;
  effectKind: "damage" | "heal";
  damageType?: string | null;
  slotLevel?: number;
}

export interface CastPlan {
  ops: SpellcastingOperation[];
  result: CastResult | null;
}

// Buff/utility spells have no effect dice, so computeCastRoll returns null and
// this yields no banner — only damage/heal casts show one.
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

// Item-granted spell (#528) casts from the item's own resource, never a spell slot.
function planItemCast(spell: Spell): CastPlan {
  const castLevel = spell.item?.castLevel ?? spell.level;
  const castRoll = computeCastRoll(spell, castLevel);
  const result = castRoll ? bannerFor(spell, castRoll, undefined) : null;
  return { ops: [{ type: "castItemSpell", entryId: spell.id, roll: castRoll?.total ?? 0 }], result };
}

export function planCast(spell: Spell, slotLevel?: number): CastPlan {
  if (spell.source === "item") return planItemCast(spell);

  const isCantrip = spell.level === 0;
  const resolvedSlotLevel = slotLevel ?? spell.level;
  const castRoll = computeCastRoll(spell, resolvedSlotLevel);

  if (!castRoll) {
    // No effect dice: just expend the slot (cantrips expend nothing).
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

// Reads the served roll (#1381) for slotLevel — never re-derives it (see
// buildSpellcastingView) — and returns a copy since the entry lives in shared
// query cache state and callers mutate their own copy (e.g. crit flag).
export function computeCastSpec(spell: Spell, slotLevel: number): RollSpec | null {
  const entry = spell.effectRolls?.find((e) => e.slotLevel === slotLevel);
  return entry ? { ...entry.roll } : null;
}

// Internal to planCast; session mode instead uses computeCastSpec + RollContext.roll()
// so the result surfaces in the shared toast.
function computeCastRoll(
  spell: Spell,
  slotLevel: number,
): { spec: RollSpec; total: number; result: RollResult } | null {
  const spec = computeCastSpec(spell, slotLevel);
  if (!spec) return null;
  const result = rollSpec(spec);
  return { spec, total: result.total, result };
}

export function castAnnounceLine(spell: Spell, spellSaveDC: number | undefined): string | null {
  if (spell.attackType !== "save" || spellSaveDC === undefined) return null;
  const dc = saveDcLabel(spell, spellSaveDC);
  if (!dc) return null;
  return spell.saveEffect === "half" ? `${dc}, half on success` : dc;
}
