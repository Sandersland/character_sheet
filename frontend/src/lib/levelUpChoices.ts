// Data-only wiring for the ceremony's Choose-N steps (#896): one config per
// choice kind maps a shared UI (ChoiceStep) to its catalog source, the
// character's already-known set, and the draft field it writes. No JSX.

import { fetchDisciplines, fetchManeuvers, fetchReference } from "@/api/client";
import { FIGHTING_STYLE_OPTIONS, fightingStyleLabel } from "@/lib/fightingStyles";
import type { LevelUpDraft } from "@/lib/levelUpSteps";
import type { Character, LevelUpStepKind } from "@/types/character";

export interface ChoiceOption {
  id: string;
  name: string;
  description?: string;
}

export interface ChoiceKindConfig {
  loadOptions(): Promise<ChoiceOption[]>;
  /** Ids the character already owns — excluded from the picker. */
  fromCharacter(character: Character): Set<string>;
  /** Currently-selected ids in the draft. */
  selected(draft: LevelUpDraft): string[];
  /** Draft patch that replaces this kind's selection with `ids`. */
  select(draft: LevelUpDraft, ids: string[]): Partial<LevelUpDraft>;
  /** Single-select kinds (fightingStyle) render radio-style and write a scalar. */
  single?: boolean;
}

const maneuvers: ChoiceKindConfig = {
  loadOptions: () =>
    fetchManeuvers().then((list) =>
      list.map((m) => ({ id: m.id, name: m.name, description: m.description })),
    ),
  fromCharacter: (character) =>
    new Set(
      (character.resources?.maneuversKnown ?? [])
        .map((e) => e.maneuverId)
        .filter((id): id is string => id != null),
    ),
  selected: (draft) =>
    (draft.maneuvers ?? []).map((op) => op.maneuverId).filter((id): id is string => id != null),
  select: (_draft, ids) => ({ maneuvers: ids.map((id) => ({ type: "learnManeuver", maneuverId: id })) }),
};

const fightingStyle: ChoiceKindConfig = {
  single: true,
  loadOptions: () =>
    Promise.resolve(
      FIGHTING_STYLE_OPTIONS.map((o) => ({
        id: o.key,
        name: fightingStyleLabel(o.key),
        description: o.description,
      })),
    ),
  fromCharacter: (character) =>
    character.resources?.fightingStyle ? new Set([character.resources.fightingStyle]) : new Set(),
  selected: (draft) => (draft.fightingStyle ? [draft.fightingStyle] : []),
  select: (_draft, ids) => ({ fightingStyle: ids[0] }),
};

const toolProficiency: ChoiceKindConfig = {
  loadOptions: () =>
    fetchReference().then((ref) => ref.artisanTools.map((t) => ({ id: t.name, name: t.name }))),
  fromCharacter: (character) =>
    new Set((character.resources?.toolProficienciesKnown ?? []).map((e) => e.name)),
  selected: (draft) => (draft.toolProficiencies ?? []).map((op) => op.name),
  select: (_draft, ids) => ({
    toolProficiencies: ids.map((name) => ({ type: "learnToolProficiency", name })),
  }),
};

const disciplines: ChoiceKindConfig = {
  loadOptions: () =>
    fetchDisciplines().then((list) =>
      list.map((d) => ({ id: d.id, name: d.name, description: d.description })),
    ),
  fromCharacter: (character) =>
    new Set(
      (character.resources?.disciplinesKnown ?? [])
        .map((e) => e.disciplineId)
        .filter((id): id is string => id != null),
    ),
  selected: (draft) =>
    (draft.disciplines ?? []).map((op) => op.disciplineId).filter((id): id is string => id != null),
  select: (_draft, ids) => ({ disciplines: ids.map((id) => ({ type: "learnDiscipline", disciplineId: id })) }),
};

export const CHOICE_KIND_CONFIGS: Partial<Record<LevelUpStepKind, ChoiceKindConfig>> = {
  maneuvers,
  fightingStyle,
  toolProficiency,
  disciplines,
};

/**
 * Next selection after toggling `id`, or null when the pick is blocked. Single-
 * select always replaces; multi-select toggles off a chosen id, adds an unchosen
 * one, and refuses an (N+1)th pick (the exact-count gate — #896).
 */
export function nextChoiceSelection(
  selectedIds: readonly string[],
  id: string,
  opts: { single: boolean; count: number },
): string[] | null {
  if (opts.single) return [id];
  if (selectedIds.includes(id)) return selectedIds.filter((s) => s !== id);
  if (selectedIds.length >= opts.count) return null;
  return [...selectedIds, id];
}

/** Case-insensitive name/description filter for the options list. */
export function filterChoiceOptions(options: ChoiceOption[], search: string): ChoiceOption[] {
  const q = search.trim().toLowerCase();
  if (!q) return options;
  return options.filter(
    (o) => o.name.toLowerCase().includes(q) || (o.description?.toLowerCase().includes(q) ?? false),
  );
}

/** Informational text for an empty list from a non-error cause, else null. */
export function emptyChoiceText(availableCount: number, filteredCount: number): string | null {
  if (availableCount === 0) return "Nothing left to choose — you already know them all.";
  if (filteredCount === 0) return "No options match your search.";
  return null;
}
