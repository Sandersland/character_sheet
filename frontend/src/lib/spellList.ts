// Pure spell-list derivation for SpellsSection — no JSX.
import { isMulticlass } from "@/lib/multiclass";
import { derivePreparedSummary } from "@/lib/preparedSummary";
import { availableArcanaLevels, availableSlotLevels } from "@/lib/spellPicker";
import { runeState } from "@/lib/spellRow";
import type { ActiveBuff, Character, Spell, SpellSchool } from "@/types/character";

type Spellcasting = NonNullable<Character["spellcasting"]>;

export interface SpellListDerivation {
  availableSlotLevels: number[];
  availableArcanaLevels: number[];
  learnedSpellIds: Set<string>;
  sortedSpells: Spell[];
  dismissibleSpellBuffs: ActiveBuff[];
  slotsArePactMagic: boolean;
}

export function deriveSpellList(character: Character): SpellListDerivation {
  const spellcasting = character.spellcasting!;
  const { slots = [], arcana = [], spells = [] } = spellcasting;

  const sortedSpells = [...spells].sort(
    (a, b) => a.level - b.level || a.name.localeCompare(b.name),
  );

  // Single-class warlocks keep Pact Magic slots in the merged `slots` block, so it
  // carries the "Pact Magic" label; a multiclass warlock's pact slots live separately.
  const slotsArePactMagic =
    (character.classes?.[0]?.name ?? "").toLowerCase() === "warlock" &&
    !isMulticlass(character.classes);

  // while-active self-buffs (e.g. Mage Armor) sourced from a spell in this book.
  const dismissibleSpellBuffs = (character.activeEffects?.buffs ?? []).filter(
    (b) => b.duration === "while-active" && spells.some((s) => s.id === b.sourceEntryId),
  );

  return {
    availableSlotLevels: availableSlotLevels(slots),
    availableArcanaLevels: availableArcanaLevels(arcana),
    learnedSpellIds: new Set(spells.flatMap((s) => (s.spellId ? [s.spellId] : []))),
    sortedSpells,
    dismissibleSpellBuffs,
    slotsArePactMagic,
  };
}

// One-liner under a Pact Magic slot group (#1139): warlock slots all cast at their
// single pact level and refresh on a short rest — clarifies "why only level N?".
export function pactMagicNote(slotLevel: number): string {
  return `All slots are cast at level ${slotLevel} and return on a short rest.`;
}

// Prepared-spell budget (#883): N prepared of the derived cap, plus atLimit gate.
// limit === null only for a non-caster — a 2014 known caster's Spells Known
// number is a non-null limit same as any 2024 prepared caster's (#1507); it's
// casterModel, not this null check, that tells the two mechanics apart.
export interface PreparedBudget {
  count: number;
  limit: number | null;
  atLimit: boolean;
  /** Served model (#1511 D2) — carried here so SpellRow/SpellbookList need not re-read the payload. */
  casterModel?: "known" | "prepared" | null;
  /** Served locked-rune tooltip word (#1511 D4), e.g. "Always prepared" / "Known". */
  alwaysAvailableLabel?: string;
  /** Served meter/roster noun (#1511 D4), e.g. "Prepared" / "Spells known". */
  preparedLabel?: string;
}

export function preparedBudget(sc: Spellcasting): PreparedBudget {
  const summary = derivePreparedSummary(sc);
  const casterModel = sc.casterModel ?? null;
  const alwaysAvailableLabel = sc.alwaysAvailableLabel;
  const preparedLabel = sc.preparedLabel;
  if (!summary) return { count: 0, limit: null, atLimit: false, casterModel, alwaysAvailableLabel, preparedLabel };
  const { count, limit } = summary;
  return { count, limit, atLimit: limit != null && count >= limit, casterModel, alwaysAvailableLabel, preparedLabel };
}

// The served label with its fallback — kept HERE (lib/, not features/spells)
// so the grimoire components never author the literal word themselves (#1511
// D4's grep AC: no "Always prepared"/"Prepared" literal in features/spells).
// Structural param types accept both PreparedBudget and a raw Spellcasting.
export function alwaysAvailableLabelOf(source: { alwaysAvailableLabel?: string }): string {
  return source.alwaysAvailableLabel ?? "Always prepared";
}

export function preparedLabelOf(source: { preparedLabel?: string }): string {
  return source.preparedLabel ?? "Prepared";
}

// Whether toggling a spell's rune *to prepared* is allowed. Unpreparing (already
// prepared) and always-prepared/known-locked runes are never blocked; a new
// prepare is blocked only at the cap. Only non-casters (limit null) are unbounded.
export function canPrepare(spell: Spell, budget: PreparedBudget): boolean {
  if (spell.prepared || runeState(spell, budget.casterModel) === "locked") return true;
  return !budget.atLimit;
}

// At-cap swap targets (#938): runeState "prepared" already excludes
// cantrips/granted AND (#1511) a known caster's leveled spells, which are
// "locked" rather than "prepared" — so this is empty for a known caster,
// making the at-cap swap bar unreachable for one.
export function swapCandidates(spells: Spell[], casterModel?: "known" | "prepared" | null): Spell[] {
  return spells.filter((s) => runeState(s, casterModel) === "prepared");
}

// Grimoire filter strip: level / school / prepared-only / ritual-only.
export interface SpellbookFilter {
  level: number | null;
  school: SpellSchool | null;
  prepared: boolean;
  ritual: boolean;
}

export function filterSpellbook(
  spells: Spell[],
  f: SpellbookFilter,
  casterModel?: "known" | "prepared" | null,
): Spell[] {
  return spells.filter((s) => {
    if (f.level != null && s.level !== f.level) return false;
    if (f.school && s.school !== f.school) return false;
    if (f.prepared && runeState(s, casterModel) === "unprepared") return false;
    if (f.ritual && !s.ritual) return false;
    return true;
  });
}

