import { schoolLabel } from "@/lib/spellMeta";
import type { CatalogSpell, ForgetSpellOperation, LearnSpellOperation, LevelUpStep, Spell, SpellSchool } from "@/types/character";

export interface NewSpellsMeta {
  count: number;
  maxSpellLevel: number;
  magicalSecrets: boolean;
  canSwap: boolean;
  cantrips: number;
  /** `null` = unrestricted; branch on `=== null`, never truthiness — `[]` is truthy. */
  spellLists: string[] | null;
  cantripLists: string[] | null;
  casterModel: "known" | "prepared" | null;
  expandedSpellIds: string[];
  spellSchools: string[] | null;
  freeSchoolPicks: number;
}

function readSpellSchoolMeta(step: LevelUpStep): Pick<NewSpellsMeta, "spellSchools" | "freeSchoolPicks"> {
  const freeSchoolPicks = step.meta?.freeSchoolPicks;
  return {
    spellSchools: (step.meta?.spellSchools as string[] | null | undefined) ?? null,
    freeSchoolPicks: typeof freeSchoolPicks === "number" ? freeSchoolPicks : 0,
  };
}

export function readNewSpellsMeta(step: LevelUpStep): NewSpellsMeta {
  const max = step.meta?.maxSpellLevel;
  const cantrips = step.meta?.cantrips;
  const casterModel = step.meta?.casterModel;
  return {
    count: step.count ?? 0,
    maxSpellLevel: typeof max === "number" ? max : 0,
    magicalSecrets: step.meta?.magicalSecrets === true,
    canSwap: step.meta?.canSwap === true,
    cantrips: typeof cantrips === "number" ? cantrips : 0,
    spellLists: (step.meta?.spellLists as string[] | null | undefined) ?? null,
    cantripLists: (step.meta?.cantripLists as string[] | null | undefined) ?? null,
    casterModel: casterModel === "known" || casterModel === "prepared" ? casterModel : null,
    expandedSpellIds: (step.meta?.expandedSpellIds as string[] | undefined) ?? [],
    ...readSpellSchoolMeta(step),
  };
}

/** A user-learned (source null) leveled spell — cantrips and granted/item spells are never swappable. */
export function swappableKnownSpells(spells: Spell[]): Spell[] {
  return spells.filter((s) => s.source == null && s.level > 0);
}

/** The server requires an exact learns === count + forgotten match. */
export function toggleForgetSpell(
  draft: { spellsForgotten?: ForgetSpellOperation[]; spellsLearned?: LearnSpellOperation[] },
  entryId: string,
  count: number,
): { spellsForgotten: ForgetSpellOperation[]; spellsLearned: LearnSpellOperation[] } {
  const learned = draft.spellsLearned ?? [];
  if (draft.spellsForgotten?.[0]?.entryId === entryId) {
    return { spellsForgotten: [], spellsLearned: learned.slice(0, count) };
  }
  return { spellsForgotten: [{ type: "forgetSpell", entryId }], spellsLearned: learned };
}

/** Display filter over the server-computed spellLists/expandedSpellIds; real enforcement is assertPickSpellEligibility on the backend. */
export function eligibleNewSpells(
  catalog: CatalogSpell[] | null,
  opts: { maxSpellLevel: number; spellLists: string[] | null; expandedSpellIds?: string[] },
): CatalogSpell[] {
  const onList = (s: CatalogSpell) =>
    opts.spellLists === null || s.classes.some((c) => opts.spellLists!.includes(c)) || (opts.expandedSpellIds?.includes(s.id) ?? false);
  return (catalog ?? []).filter((s) => s.level >= 1 && s.level <= opts.maxSpellLevel && onList(s));
}

/** cantripLists is a separate served value from spellLists — 2024 Magical Secrets broadens spells but not cantrips. */
export function eligibleNewCantrips(
  catalog: CatalogSpell[] | null,
  opts: { cantripLists: string[] | null },
): CatalogSpell[] {
  return (catalog ?? []).filter(
    (s) => s.level === 0 && (opts.cantripLists === null || s.classes.some((c) => opts.cantripLists!.includes(c))),
  );
}

/** Mirrors assertSpellSchoolEligibility's (backend) free-pick counting — never re-derives which schools or how many free picks. */
export function spellSchoolEligible(
  spell: { school: string },
  spellSchools: string[] | null,
  freeSchoolPicks: number,
  offListSelectedCount: number,
): boolean {
  if (spellSchools === null || spellSchools.includes(spell.school)) return true;
  return offListSelectedCount < freeSchoolPicks;
}

export function offListSelectedCount(
  selectedIds: string[],
  catalog: CatalogSpell[] | null,
  spellSchools: string[] | null,
): number {
  if (spellSchools === null || !catalog) return 0;
  const schoolById = new Map(catalog.map((s) => [s.id, s.school]));
  return selectedIds.filter((id) => {
    const school = schoolById.get(id);
    return school !== undefined && !spellSchools.includes(school);
  }).length;
}

/** Matches the same "prepared" default assertForgets (backend) falls back to. */
export function casterModelNoun(casterModel: "known" | "prepared" | null): string {
  return casterModel === "known" ? "known spell" : "prepared spell";
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function spellListsLabel(lists: string[] | null): string {
  if (lists === null) return "any class's";
  const names = lists.map(capitalize);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} or ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`;
}

/** Routed through schoolLabel, never a bare capitalize, to stay in sync with canonical SpellSchool display names. */
export function spellSchoolsLabel(schools: string[]): string {
  const names = schools.map((s) => schoolLabel(s as SpellSchool));
  if (names.length <= 1) return names[0] ?? "";
  return names.length === 2
    ? `${names[0]} or ${names[1]}`
    : `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`;
}

export function toggleLearnSpell(
  current: LearnSpellOperation[],
  spellId: string,
  cap: number,
): LearnSpellOperation[] {
  if (current.some((op) => op.spellId === spellId)) {
    return current.filter((op) => op.spellId !== spellId);
  }
  if (current.length >= cap) return current;
  return [...current, { type: "learnSpell", spellId }];
}

export function selectedSpellIds(ops: LearnSpellOperation[] | undefined): string[] {
  return (ops ?? []).map((op) => op.spellId);
}
