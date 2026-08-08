/**
 * useSpellPicker — state + orchestration for InlineSpellPicker.
 *
 * Owns per-spell row state and composes the pure spellPicker predicates
 * with useRoll() and the async spellcasting client call. Keeps the component
 * (and its sub-components) presentational.
 */

import { useRef, useState } from "react";

import { autoVerdict } from "@/lib/attackTallySummary";
import { isNaturalOne, isNaturalTwenty, keptD20 } from "@/lib/dice";
import { randomId } from "@/lib/ids";
import { useRoll } from "@/features/dice/RollContext";
import { useRollLogger } from "@/features/session/useRollLogger";
import { applySpellcastingTransactions } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import {
  buildCastSettle,
  castAnnounceLine,
  castApplyPayload,
  castSpellOp,
  computeCastSpec,
  type CastSettleView,
} from "@/lib/spellCast";
import type { RollSpec } from "@/lib/dice";
import {
  SCHOOL_TONE,
  effectPreview,
  componentsLabel,
  saveDcLabel,
  defaultTarget,
  targetLocked,
  isAllyTarget,
  type AllyOption,
  type Target,
  type SchoolTone,
} from "@/lib/spellMeta";
import { expectedRollView, type ExpectedRoll } from "@/lib/spellPickerView";
import {
  availableSlotLevels,
  availableArcanaLevels,
  isArcanumLevel,
  availableSlotsForSpell,
  resolvedSlot,
  spellRestrictionFlags,
  slotRestrictionHint,
  filterCastableSpells,
  sortSpells,
  type EconomySlot,
  type SpellCastThisTurn,
} from "@/lib/spellPicker";
import type { RecordedSpellCast } from "@/features/session/useTurnState";
import type { Character, Spell } from "@/types/character";

/** Per-spell interactive state keyed by spell.id. */
export interface SpellRowState {
  slotLevel: number | undefined;  // chosen slot level (undefined = not picked yet)
  target: Target;
  casting: boolean;
  attackRolled: boolean;  // true once Attack was pressed (attack spells only); gates Cast
  error: string | null;
}

/** Derived, render-ready values for one spell row. */
export interface SpellRowView {
  isCantrip: boolean;
  schoolTone: SchoolTone | "neutral";
  availableSlots: number[];
  spellSlot: number | undefined;
  usesArcanum: boolean;
  locked: boolean;
  preview: string | null;
  compStr: string | null;
  isAttack: boolean;
  isSave: boolean;
  dcLabel: string | null;
  spellAttackBonus: number;
  castDisabled: boolean;
  attackDisabled: boolean;
  isHeal: boolean;
  allies: AllyOption[];
  /** The cast sheet's "what happens" line (#1163) — plain text + a dice pill. */
  expected: ExpectedRoll;
}

// CastSettleView is defined in lib/spellCast.ts (alongside the other pure
// cast-settle helpers) and re-exported here so callers keep importing it from
// this hook's module.
export type { CastSettleView } from "@/lib/spellCast";

export interface UseSpellPickerOptions {
  character: Character;
  sessionId: string;
  onLogChanged: () => void;
  slot: EconomySlot;
  slotAvailable: boolean;
  onCommitSlot: (spellLevel: number) => void;
  spellCastThisTurn: SpellCastThisTurn;
  castingTimeFilter?: string;
  /** Opted-in party members a healing cast can target on their sheet (#462). */
  allies?: AllyOption[];
  /** Called after a cast settles so the turn card's cast tally can record it (#1164). */
  onCastSettled?: (recorded: RecordedSpellCast) => void;
}

export interface UseSpellPicker {
  sortedSpells: Spell[];
  slotUsedHint: string | null;
  isEmpty: boolean;
  emptyMessage: string;
  hasCastable: boolean;
  rowFor: (spell: Spell) => SpellRowState;
  viewFor: (spell: Spell, row?: SpellRowState) => SpellRowView;
  patchRow: (spellId: string, patch: Partial<SpellRowState>) => void;
  handleCast: (spell: Spell) => Promise<void>;
  handleAttackRoll: (spell: Spell) => void;
  /** The pinned result well's content — null before any cast this sheet-open (#1164). */
  lastCast: CastSettleView | null;
}

export function useSpellPicker(opts: UseSpellPickerOptions): UseSpellPicker {
  const {
    character,
    sessionId,
    onLogChanged,
    slot,
    slotAvailable,
    onCommitSlot,
    spellCastThisTurn,
    castingTimeFilter,
    allies = [],
    onCastSettled,
  } = opts;

  const { roll } = useRoll();
  const logRollSafe = useRollLogger(character.id, sessionId, onLogChanged);
  const spellcasting = character.spellcasting!;
  const { slots = [], arcana = [], spells = [], spellSaveDC, spellAttackBonus } = spellcasting;

  // castMutation.error is deliberately never read: a picker casts one of many
  // rows, so a failure has to land on the row that caused it (via patchRow),
  // not on a hook-wide field that would blame whichever spell rendered last.
  const castMutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: (ops: Parameters<typeof applySpellcastingTransactions>[1]) =>
      applySpellcastingTransactions(character.id, ops),
    toCharacter: (c) => c,
    fallbackMessage: "Something went wrong.",
  });

  const [rowStates, setRowStates] = useState<Record<string, SpellRowState>>({});
  const [lastCast, setLastCast] = useState<CastSettleView | null>(null);

  // swingId correlates a spell attack's d20 with its cast's damage roll as one
  // swing (#1235/#1360), mirroring useAttackRolls' swingIdRef — a ref (not
  // state) because it must survive from handleAttackRoll to a LATER handleCast
  // click without a re-render, and is replaced on every attack roll so a
  // re-roll never reuses a stale id. Consumed (deleted) once rollAndLogCast
  // reads it, so a later damage-only cast can't pick up a stale swing.
  const spellAttackRef = useRef<Record<string, { swingId: string; nat20: boolean; nat1: boolean }>>({});

  function getRow(spellId: string, spell: Spell, initialSlot: number | undefined): SpellRowState {
    return rowStates[spellId] ?? {
      slotLevel: initialSlot,
      target: defaultTarget(spell),
      casting: false,
      attackRolled: false,
      error: null,
    };
  }

  function patchRow(spellId: string, patch: Partial<SpellRowState>) {
    // Seed a fresh row from the real spell so its default target (self for heals) is correct.
    const spell = spells.find((s) => s.id === spellId);
    const initialSlot = spell ? availableSlotsForSpell(spell, slotLevels, arcanaLevels)[0] : undefined;
    setRowStates((prev) => ({
      ...prev,
      [spellId]: { ...getRow(spellId, spell ?? ({} as Spell), initialSlot), ...prev[spellId], ...patch },
    }));
  }

  const slotLevels = availableSlotLevels(slots);
  const arcanaLevels = availableArcanaLevels(arcana);

  const { bonusActionBlockedByActionSpell, actionLimitedToCantrips } = spellRestrictionFlags(
    slot,
    spellCastThisTurn,
  );

  const castableSpells = filterCastableSpells(spells, {
    castingTimeFilter,
    slotLevels,
    arcanaLevels,
    bonusActionBlockedByActionSpell,
    actionLimitedToCantrips,
  });
  const sortedSpells = sortSpells(castableSpells);
  const slotUsedHint = slotRestrictionHint(bonusActionBlockedByActionSpell, actionLimitedToCantrips);

  function rowFor(spell: Spell): SpellRowState {
    const slotsForSpell = availableSlotsForSpell(spell, slotLevels, arcanaLevels);
    return getRow(spell.id, spell, slotsForSpell[0]);
  }

  // Cast/Attack gating: split out of viewFor so its OR/ternary branches don't
  // count against that function's complexity budget.
  function castEligibility(row: SpellRowState, isAttack: boolean): { castDisabled: boolean; attackDisabled: boolean } {
    return {
      castDisabled: row.casting || (isAttack ? !row.attackRolled : !slotAvailable),
      attackDisabled: row.casting || !slotAvailable,
    };
  }

  function viewFor(spell: Spell, row: SpellRowState = rowFor(spell)): SpellRowView {
    const isCantrip = spell.level === 0;
    const availableSlots = availableSlotsForSpell(spell, slotLevels, arcanaLevels);
    const spellSlot = resolvedSlot(spell, row.slotLevel, slotLevels, arcanaLevels);
    const usesArcanum = !isCantrip && isArcanumLevel(spellSlot ?? spell.level, arcanaLevels);
    const isAttack = spell.attackType === "attack";
    const isSave = spell.attackType === "save";
    const dcLabel = isSave ? saveDcLabel(spell, spellSaveDC ?? 0) : null;
    const preview = effectPreview(spell, spellSlot);
    return {
      isCantrip,
      schoolTone: SCHOOL_TONE[spell.school as keyof typeof SCHOOL_TONE] ?? "neutral",
      availableSlots,
      spellSlot,
      usesArcanum,
      locked: targetLocked(spell),
      preview,
      compStr: componentsLabel(spell),
      isAttack,
      isSave,
      dcLabel,
      spellAttackBonus: spellAttackBonus ?? 0,
      ...castEligibility(row, isAttack),
      isHeal: spell.effectKind === "heal",
      allies,
      expected: expectedRollView(spell, { dcLabel, spellAttackBonus: spellAttackBonus ?? 0, preview }),
    };
  }

  // Roll the cast's effect dice (if any) via RollContext — surfaces in the
  // global toast AND (#1164) logs to the session record, closing the
  // weapon/spell log asymmetry. Split out of handleCast to keep its own
  // branching (and fallow's complexity gate) in check.
  function rollAndLogCast(
    spell: Spell,
    castSpec: RollSpec | null,
    targetNote: string,
  ): { total: number; keptDice: number[] } {
    if (!castSpec) return { total: 0, keptDice: [] };
    const kindLabel = spell.effectKind === "heal" ? "healing" : "damage";
    const result = roll(castSpec, `${spell.name} — ${kindLabel}${targetNote}`);
    // An attack spell's cast follows its own d20 (handleAttackRoll) — share that
    // swing's id and verdict so the two events group as one swing (#1360). A
    // save/no-attack cast has no ref entry, so it logs exactly as before.
    // Rolling damage is an implicit hit call (same rule useAttackRolls.handleDamage
    // documents) UNLESS the attack die already decided miss/crit — a nat-1
    // attack still carries verdict "miss" onto its damage event, not "hit".
    // NOT consumed here — a rejected mutateAsync leaves handleCast's catch
    // branch offering a retry (same row, no re-roll), so the entry must
    // survive until handleCast's success path actually commits the cast (a
    // failed-then-retried cast logs TWO damage events sharing one swingId,
    // correctly — both belong to the one attack, same as a damage rider).
    const attack = spellAttackRef.current[spell.id];
    logRollSafe(
      "damage",
      spell.name,
      result,
      castSpec,
      spell.damageType ?? undefined,
      attack
        ? {
            swingId: attack.swingId,
            verdict: attack.nat1 ? "miss" : attack.nat20 ? "crit" : "hit",
            crit: attack.nat20,
          }
        : undefined,
    );
    return { total: result.total, keptDice: result.dice.filter((d) => !d.dropped).map((d) => d.value) };
  }

  // Settle the result well (#1164) and notify the turn card's cast tally —
  // split out of handleCast so its own branching doesn't count against it.
  function settleCast(
    spell: Spell,
    effectiveSlot: number,
    castSpec: RollSpec | null,
    rollTotal: number,
    keptDice: number[],
  ) {
    const announce = castAnnounceLine(spell, spellSaveDC);
    setLastCast(buildCastSettle(spell, effectiveSlot, Boolean(castSpec), rollTotal, keptDice, announce));
    onCastSettled?.({
      spellName: spell.name,
      level: effectiveSlot,
      total: castSpec ? rollTotal : undefined,
      damageType: spell.damageType ?? undefined,
      announce: announce ?? undefined,
    });
  }

  // Resolve the row + effective slot for a cast attempt, or null when a
  // leveled spell's matching slots were exhausted between render and click —
  // split out of handleCast so this guard's branches don't count against it.
  function resolveCastRow(spell: Spell): { row: SpellRowState; effectiveSlot: number } | null {
    const row = rowStates[spell.id] ?? {
      ...getRow(spell.id, spell, undefined),
      slotLevel: availableSlotsForSpell(spell, slotLevels, arcanaLevels)[0],
    };
    const spellSlot = resolvedSlot(spell, row.slotLevel, slotLevels, arcanaLevels);
    if (spell.level > 0 && spellSlot === undefined) return null;
    return { row, effectiveSlot: spellSlot ?? spell.level };
  }

  async function handleCast(spell: Spell) {
    const resolved = resolveCastRow(spell);
    if (!resolved) {
      patchRow(spell.id, { casting: false, error: "No spell slot available — all matching slots have been used." });
      return;
    }
    const { row, effectiveSlot } = resolved;

    patchRow(spell.id, { casting: true, error: null });

    // Resolve where the effect lands so we can label the roll + build the apply.
    const ally = isAllyTarget(row.target) ? row.target : null;
    const targetNote = row.target === "self" ? " → your HP" : ally ? ` → ${ally.name}'s HP` : "";

    const castSpec = computeCastSpec(spell, effectiveSlot);
    const { total: rollTotal, keptDice } = rollAndLogCast(spell, castSpec, targetNote);

    // Apply the rolled effect in the same transaction: self → own HP, an ally →
    // that party member's sheet (heal only). "other" relays to the DM (no apply).
    const apply = castApplyPayload(spell, row.target, rollTotal, Boolean(castSpec));
    const op = castSpellOp(spell, effectiveSlot, rollTotal, apply);

    try {
      await castMutation.mutateAsync([op]);
      // Attack spells committed the slot on the Attack press; others commit on cast.
      if (spell.attackType !== "attack") {
        onCommitSlot(spell.level);
      }
      patchRow(spell.id, { casting: false, attackRolled: false });
      // Consumed only once the cast actually commits (#1360) — see rollAndLogCast's
      // comment for why a failed cast must NOT clear this before a retry.
      delete spellAttackRef.current[spell.id];
      settleCast(spell, effectiveSlot, castSpec, rollTotal, keptDice);
    } catch (err) {
      patchRow(spell.id, {
        casting: false,
        error: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }

  function handleAttackRoll(spell: Spell) {
    // Commit the economy slot first (action is spent on the attack declaration).
    onCommitSlot(spell.level);
    const attackSpec = { count: 1, faces: 20, modifier: spellAttackBonus ?? 0 };
    const result = roll(attackSpec, `${spell.name} spell attack`);
    const attack = {
      total: result.total,
      keptFace: keptD20(result)?.value ?? null,
      nat20: isNaturalTwenty(result),
      nat1: isNaturalOne(result),
      // #1120: a spell attack is never a weapon attack or Unarmed Strike, so
      // Champion's crit-range widening never applies here — literal nat20.
      criticalHit: isNaturalTwenty(result),
    };
    // Fresh id per attack roll (#1235/#1360) — rollAndLogCast reads it back
    // via spell.id when the cast follows. Note: no crit-doubling here — the
    // picker still doesn't double dice for a leveled attack spell's nat-20.
    const swingId = randomId();
    spellAttackRef.current[spell.id] = { swingId, nat20: attack.nat20, nat1: attack.nat1 };
    logRollSafe("attack", spell.name, result, attackSpec, undefined, {
      swingId,
      verdict: autoVerdict(attack),
      nat20: attack.nat20,
      nat1: attack.nat1,
      crit: attack.nat20,
    });
    patchRow(spell.id, { attackRolled: true });
  }

  return {
    sortedSpells,
    slotUsedHint,
    isEmpty: castableSpells.length === 0 && !slotUsedHint,
    emptyMessage:
      slotLevels.length === 0
        ? "No spell slots remaining."
        // #1511: reads the served casterModel, not composed from preparedLabel —
        // "Spells known" doesn't fit the "No ___ spells available" template
        // without doubling "spells" ("No spells known spells available…"), so a
        // known caster gets its own fixed copy instead of the generic template.
        : spellcasting.casterModel === "known"
          ? "No known spells available to cast right now."
          : `No ${(spellcasting.preparedLabel ?? "Prepared").toLowerCase()} spells available to cast right now.`,
    hasCastable: castableSpells.length > 0,
    rowFor,
    viewFor,
    patchRow,
    handleCast,
    handleAttackRoll,
    lastCast,
  };
}
