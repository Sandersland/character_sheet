// The repeatable subclassChoice kind resolves PER STEP via choiceConfigForStep, since one draft array (subclassChoices) is shared by several steps keyed on meta.key (a Hunter Ranger's four tiers, e.g.).

import { fetchFeats, fetchManeuvers, fetchReference, fetchSubclassChoiceOptions } from "@/api/client";
import type { LevelUpDraft } from "@/lib/levelUpSteps";
import type { Character, LevelUpStep, LevelUpStepKind } from "@/types/character";
import type { RulesEdition } from "@character-sheet/shared-types";

export interface ChoiceOption {
  id: string;
  name: string;
  description?: string;
  tag?: string;
}

export interface ChoiceLoadContext {
  // Corresponds to LevelUpPlanResponse.target.newLevel.
  targetLevel: number;
  // Every catalog fetch below is edition-scoped.
  edition: RulesEdition;
  // Fed straight through to fetchFeats' class-scope gate. Only fightingStyleFeat reads this.
  classNames?: string[];
  // Only `expertise` reads this: its option list has no catalog fetch — the character's own proficient-skill set IS the catalog.
  proficientSkills?: ChoiceOption[];
}

export interface ChoiceKindConfig {
  loadOptions(ctx: ChoiceLoadContext): Promise<ChoiceOption[]>;
  fromCharacter(character: Character): Set<string>;
  selected(draft: LevelUpDraft): string[];
  select(draft: LevelUpDraft, ids: string[]): Partial<LevelUpDraft>;
  single?: boolean;
}

const maneuvers: ChoiceKindConfig = {
  loadOptions: (ctx) =>
    fetchManeuvers(ctx.edition).then((list) =>
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

const fightingStyleFeat: ChoiceKindConfig = {
  single: true,
  // The server applies the per-class subset via fightingStyleFeatOfferedForClasses; this config never re-derives it, only forwards the class-name scope.
  loadOptions: (ctx) =>
    fetchFeats(ctx.edition, undefined, ctx.classNames).then((list) =>
      list
        .filter((f) => f.category === "fighting_style")
        .map((f) => ({ id: f.id, name: f.name, description: f.description })),
    ),
  fromCharacter: (character) =>
    new Set(
      character.advancements
        .filter((a) => a.slot === "fightingStyle")
        .map((a) => a.featId)
        .filter((id): id is string => id != null),
    ),
  selected: (draft) => (draft.fightingStyleFeat?.featId ? [draft.fightingStyleFeat.featId] : []),
  select: (_draft, ids) => ({
    fightingStyleFeat: ids[0] ? { type: "takeFeat", featId: ids[0], slot: "fightingStyle" } : undefined,
  }),
};

const toolProficiency: ChoiceKindConfig = {
  loadOptions: (ctx) =>
    fetchReference(ctx.edition).then((ref) => ref.artisanTools.map((t) => ({ id: t.name, name: t.name }))),
  fromCharacter: (character) =>
    new Set((character.resources?.toolProficienciesKnown ?? []).map((e) => e.name)),
  selected: (draft) => (draft.toolProficiencies ?? []).map((op) => op.name),
  select: (_draft, ids) => ({
    toolProficiencies: ids.map((name) => ({ type: "learnToolProficiency", name })),
  }),
};

// Mirrors buildSkillsView's own proficiency resolution (feat/item grants included).
const expertise: ChoiceKindConfig = {
  loadOptions: (ctx) => Promise.resolve(ctx.proficientSkills ?? []),
  fromCharacter: (character) =>
    new Set((character.resources?.expertiseKnown ?? []).map((e) => e.skill)),
  selected: (draft) => (draft.expertise ?? []).map((op) => op.skill),
  select: (_draft, ids) => ({ expertise: ids.map((skill) => ({ type: "learnExpertise", skill })) }),
};

export const CHOICE_KIND_CONFIGS: Partial<Record<LevelUpStepKind, ChoiceKindConfig>> = {
  maneuvers,
  fightingStyleFeat,
  toolProficiency,
  expertise,
};

// Per-step, not per-kind: a subclass's several tiers share one draft.subclassChoices array, so scoping to meta.key is what stops picks and caps leaking across keys.
export function choiceConfigForStep(step: LevelUpStep): ChoiceKindConfig | undefined {
  if (step.kind !== "subclassChoice") return CHOICE_KIND_CONFIGS[step.kind];

  const key = step.meta?.key;
  const catalogSource = step.meta?.catalogSource;
  if (typeof key !== "string" || typeof catalogSource !== "string") return undefined;

  return {
    loadOptions: (ctx) =>
      fetchSubclassChoiceOptions(catalogSource, ctx.edition).then((list) =>
        list.map((o) => ({ id: o.id, name: o.name, description: o.description })),
      ),
    fromCharacter: (character) =>
      new Set(
        (character.resources?.choicesKnown?.[key] ?? [])
          .map((e) => e.optionId)
          .filter((id): id is string => id != null),
      ),
    selected: (draft) =>
      (draft.subclassChoices ?? [])
        .filter((op) => op.choiceKey === key)
        .map((op) => op.optionId)
        .filter((id): id is string => id != null),
    select: (draft, ids) => ({
      subclassChoices: [
        ...(draft.subclassChoices ?? []).filter((op) => op.choiceKey !== key),
        ...ids.map((optionId) => ({ type: "learnSubclassChoice" as const, choiceKey: key, optionId })),
      ],
    }),
  };
}

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

export function filterChoiceOptions(options: ChoiceOption[], search: string): ChoiceOption[] {
  const q = search.trim().toLowerCase();
  if (!q) return options;
  return options.filter(
    (o) => o.name.toLowerCase().includes(q) || (o.description?.toLowerCase().includes(q) ?? false),
  );
}

export function emptyChoiceText(availableCount: number, filteredCount: number): string | null {
  if (availableCount === 0) return "Nothing left to choose — you already know them all.";
  if (filteredCount === 0) return "No options match your search.";
  return null;
}
