/**
 * useSpellPicker — state + orchestration for InlineSpellPicker.
 *
 * Owns per-spell row state and composes the pure lib/spellPicker predicates
 * with useRoll() and the async spellcasting client call. Keeps the component
 * (and its sub-components) presentational.
 */

import { useState } from "react";

import { useRoll } from "@/features/dice/RollContext";
import { applySpellcastingTransactions, logRoll } from "@/api/client";
import { computeCastSpec } from "@/lib/spellCast";
import { formatRollSpec } from "@/lib/dice";
import {
  SCHOOL_TONE,
  effectPreviewWithMod,
  componentsLabel,
  saveDcLabel,
  defaultTarget,
  targetLocked,
  type Target,
  type SchoolTone,
} from "@/lib/spellMeta";
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
}

export interface UseSpellPickerOptions {
  character: Character;
  sessionId: string;
  onUpdate: (c: Character) => void;
  onLogChanged: () => void;
  slot: EconomySlot;
  slotAvailable: boolean;
  onCommitSlot: (spellLevel: number) => void;
  spellCastThisTurn: SpellCastThisTurn;
  castingTimeFilter?: string;
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
}

export function useSpellPicker(opts: UseSpellPickerOptions): UseSpellPicker {
  const {
    character,
    sessionId,
    onUpdate,
    onLogChanged,
    slot,
    slotAvailable,
    onCommitSlot,
    spellCastThisTurn,
    castingTimeFilter,
  } = opts;

  const { roll } = useRoll();
  const spellcasting = character.spellcasting!;
  const { slots = [], arcana = [], spells = [], spellSaveDC, spellAttackBonus } = spellcasting;

  const [rowStates, setRowStates] = useState<Record<string, SpellRowState>>({});

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

  function viewFor(spell: Spell, row: SpellRowState = rowFor(spell)): SpellRowView {
    const isCantrip = spell.level === 0;
    const availableSlots = availableSlotsForSpell(spell, slotLevels, arcanaLevels);
    const spellSlot = resolvedSlot(spell, row.slotLevel, slotLevels, arcanaLevels);
    const usesArcanum = !isCantrip && isArcanumLevel(spellSlot ?? spell.level, arcanaLevels);
    const isAttack = spell.attackType === "attack";
    const isSave = spell.attackType === "save";
    return {
      isCantrip,
      schoolTone: SCHOOL_TONE[spell.school as keyof typeof SCHOOL_TONE] ?? "neutral",
      availableSlots,
      spellSlot,
      usesArcanum,
      locked: targetLocked(spell),
      preview: effectPreviewWithMod(spell, character, spellSlot),
      compStr: componentsLabel(spell),
      isAttack,
      isSave,
      dcLabel: isSave ? saveDcLabel(spell, spellSaveDC ?? 0) : null,
      spellAttackBonus: spellAttackBonus ?? 0,
      castDisabled: row.casting || (isAttack ? !row.attackRolled : !slotAvailable),
      attackDisabled: row.casting || !slotAvailable,
    };
  }

  async function handleCast(spell: Spell) {
    const isCantrip = spell.level === 0;
    const row = rowStates[spell.id] ?? {
      ...getRow(spell.id, spell, undefined),
      slotLevel: availableSlotsForSpell(spell, slotLevels, arcanaLevels)[0],
    };
    const spellSlot = resolvedSlot(spell, row.slotLevel, slotLevels, arcanaLevels);

    patchRow(spell.id, { casting: true, error: null });

    // Roll damage/heal via RollContext — result surfaces in the global toast.
    const castSpec = computeCastSpec(spell, character, spellSlot ?? spell.level);
    let rollTotal = 0;
    if (castSpec) {
      const kindLabel = spell.effectKind === "heal" ? "healing" : "damage";
      const targetNote = row.target === "self" ? " → your HP" : "";
      const result = roll(castSpec, `${spell.name} — ${kindLabel}${targetNote}`);
      rollTotal = result.total;
    }

    // Self-targeted effect: pass to the backend so HP is adjusted in the same transaction.
    const applyPayload =
      row.target === "self" && castSpec && spell.effectKind
        ? { target: "self" as const, kind: spell.effectKind as "heal" | "damage", amount: rollTotal }
        : undefined;

    const op = isCantrip
      ? { type: "castSpell" as const, entryId: spell.id, roll: rollTotal, apply: applyPayload }
      : { type: "castSpell" as const, entryId: spell.id, slotLevel: spellSlot!, roll: rollTotal, apply: applyPayload };

    try {
      const updated = await applySpellcastingTransactions(character.id, [op]);
      // Attack spells committed the slot on the Attack press; others commit on cast.
      if (spell.attackType !== "attack") {
        onCommitSlot(spell.level);
      }
      onUpdate(updated);
      patchRow(spell.id, { casting: false, attackRolled: false });
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
    // Log the spell attack roll (best-effort — never blocks play).
    logRoll(character.id, sessionId, {
      kind: "attack",
      source: spell.name,
      total: result.total,
      specLabel: formatRollSpec(attackSpec),
    })
      .then(onLogChanged)
      .catch((e) => console.error("roll log failed", e));
    patchRow(spell.id, { attackRolled: true });
  }

  return {
    sortedSpells,
    slotUsedHint,
    isEmpty: castableSpells.length === 0 && !slotUsedHint,
    emptyMessage:
      slotLevels.length === 0
        ? "No spell slots remaining."
        : "No prepared spells available to cast right now.",
    hasCastable: castableSpells.length > 0,
    rowFor,
    viewFor,
    patchRow,
    handleCast,
    handleAttackRoll,
  };
}
