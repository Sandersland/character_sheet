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

  // Single-class warlocks keep Pact Magic slots in the merged `slots` block; a
  // multiclass warlock's pact slots live separately.
  const slotsArePactMagic =
    (character.classes?.[0]?.name ?? "").toLowerCase() === "warlock" &&
    !isMulticlass(character.classes);

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

export function pactMagicNote(slotLevel: number): string {
  return `All slots are cast at level ${slotLevel} and return on a short rest.`;
}

// limit === null only for a non-caster (#1507) — a known caster's Spells Known
// number is a non-null limit same as a prepared caster's; casterModel, not this
// null check, tells the two mechanics apart.
export interface PreparedBudget {
  count: number;
  limit: number | null;
  atLimit: boolean;
  // Carried here (#1511 D2) so SpellRow/SpellbookList need not re-read the payload.
  casterModel?: "known" | "prepared" | null;
  alwaysAvailableLabel?: string;
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

// Kept here, not features/spells, so grimoire components never author the
// literal word themselves (#1511 D4's grep AC bans it there).
export function alwaysAvailableLabelOf(source: { alwaysAvailableLabel?: string }): string {
  return source.alwaysAvailableLabel ?? "Always prepared";
}

export function preparedLabelOf(source: { preparedLabel?: string }): string {
  return source.preparedLabel ?? "Prepared";
}

export function canPrepare(spell: Spell, budget: PreparedBudget): boolean {
  if (spell.prepared || runeState(spell, budget.casterModel) === "locked") return true;
  return !budget.atLimit;
}

// Empty for a known caster: their leveled spells are "locked" rather than
// "prepared" (#1511), which makes the at-cap swap bar unreachable for one.
export function swapCandidates(spells: Spell[], casterModel?: "known" | "prepared" | null): Spell[] {
  return spells.filter((s) => runeState(s, casterModel) === "prepared");
}

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

