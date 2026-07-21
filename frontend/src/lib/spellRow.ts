// Pure per-spell derivations for SpellRow (castability, prepare-rune state).
// Cast-routing (resolveCastAction/upcastSlotOptions) left with the grimoire's Cast
// button (#1162) — casting now lives only behind the record view's Cast door.
import { SCHOOL_TONE, type SchoolTone } from "@/lib/spellMeta";
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

