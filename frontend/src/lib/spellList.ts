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

// Prepared-spell budget (#883): N prepared of the derived cap, plus atLimit gate.
// limit === null for known casters (Sorcerer/Bard) — no prepare cap applies.
export interface PreparedBudget {
  count: number;
  limit: number | null;
  atLimit: boolean;
}

export function preparedBudget(sc: Spellcasting): PreparedBudget {
  const summary = derivePreparedSummary(sc);
  if (!summary) return { count: 0, limit: null, atLimit: false };
  const { count, limit } = summary;
  return { count, limit, atLimit: limit != null && count >= limit };
}

// Whether toggling a spell's rune *to prepared* is allowed. Unpreparing (already
// prepared) and always-prepared runes are never blocked; a new prepare is blocked
// only at the cap. Known casters (limit null) are unbounded.
export function canPrepare(spell: Spell, budget: PreparedBudget): boolean {
  if (spell.prepared || runeState(spell) === "locked") return true;
  return !budget.atLimit;
}

// At-cap swap targets (#938): runeState "prepared" already excludes cantrips/granted.
export function swapCandidates(spells: Spell[]): Spell[] {
  return spells.filter((s) => runeState(s) === "prepared");
}

// Grimoire filter strip: level / school / prepared-only / ritual-only.
export interface SpellbookFilter {
  level: number | null;
  school: SpellSchool | null;
  prepared: boolean;
  ritual: boolean;
}

export function filterSpellbook(spells: Spell[], f: SpellbookFilter): Spell[] {
  return spells.filter((s) => {
    if (f.level != null && s.level !== f.level) return false;
    if (f.school && s.school !== f.school) return false;
    if (f.prepared && runeState(s) === "unprepared") return false;
    if (f.ritual && !s.ritual) return false;
    return true;
  });
}

