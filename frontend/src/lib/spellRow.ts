// Pure per-spell derivations for SpellRow (castability, cast routing, upcast options).
import { SCHOOL_TONE, effectPreview, type SchoolTone } from "@/lib/spellMeta";
import type { Spell } from "@/types/character";

type SpellItem = NonNullable<Spell["item"]>;

export interface SpellRowDerived {
  isCantrip: boolean;
  item: SpellItem | undefined;
  atWill: boolean;
  chargeCost: number;
  itemExhausted: boolean;
  isGranted: boolean;
  schoolTone: SchoolTone | "neutral";
  noBudget: boolean;
}

// Castability + provenance for a spellbook row. Item resource gating keys off the
// `resource` string, not usesTotal (JSON.stringify(Infinity) → null on the wire).
export function deriveSpellRow(spell: Spell, availableSlots: number[]): SpellRowDerived {
  const isCantrip = spell.level === 0;
  const item = spell.source === "item" ? spell.item : undefined;
  const atWill = item ? item.resource === "atWill" : false;
  const chargeCost = item?.resource === "charges" ? item.chargeCost ?? 1 : 1;
  const itemExhausted = Boolean(item) && !atWill && (item?.usesRemaining ?? 0) < chargeCost;
  const isGranted = spell.source === "subclass" || spell.source === "item";
  const schoolTone = SCHOOL_TONE[spell.school as keyof typeof SCHOOL_TONE] ?? "neutral";
  const noBudget = (!isCantrip && !item && availableSlots.length === 0) || itemExhausted;
  return { isCantrip, item, atWill, chargeCost, itemExhausted, isGranted, schoolTone, noBudget };
}

// Prepare-rune state: cantrips/granted spells are always-prepared (locked), the
// rest toggle between prepared and known-unprepared.
export type RuneState = "locked" | "prepared" | "unprepared";

export function runeState(spell: Spell): RuneState {
  if (spell.level === 0 || spell.source === "subclass" || spell.source === "item") return "locked";
  return spell.prepared ? "prepared" : "unprepared";
}

export type CastAction =
  | { kind: "cast" }
  | { kind: "castAt"; slotLevel: number }
  | { kind: "openPicker" };

// Where a Cast click should route: fire immediately, fire at a fixed slot, or open the picker.
export function resolveCastAction(spell: Spell, availableSlots: number[]): CastAction {
  const item = spell.source === "item" ? spell.item : undefined;
  if (item) return { kind: "cast" };
  if (spell.level === 0) return { kind: "cast" };
  if (availableSlots.length === 0) return { kind: "castAt", slotLevel: spell.level };
  if (availableSlots.length === 1) return { kind: "castAt", slotLevel: availableSlots[0] };
  return { kind: "openPicker" };
}

export interface SlotOption {
  slotLevel: number;
  isUpcast: boolean;
  effect: string | null;
}

// Per-slot-level picker options with upcast flag + scaled effect preview.
export function upcastSlotOptions(
  spell: Spell,
  characterLevel: number,
  availableSlots: number[],
): SlotOption[] {
  return availableSlots.map((slotLevel) => ({
    slotLevel,
    isUpcast: slotLevel > spell.level,
    effect: effectPreview(spell, characterLevel, slotLevel),
  }));
}
