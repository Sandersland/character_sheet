// The ceremony's class-choice step (#1170, BG3-style): pure derivation of the
// options a player can advance — every existing class entry (always eligible),
// plus each not-yet-owned reference class gated by multiclassPrereqMet (ported
// from the retired AddClassPanel). No JSX; consumed by useLevelUpCeremony /
// ClassChoiceStep.

import { multiclassPrereqMet } from "@/lib/multiclass";
import type { Character, ClassOption, LevelUpTarget } from "@/types/character";

export interface ClassChoiceOption {
  target: LevelUpTarget;
  name: string;
  /** "Level N → N+1" for an existing entry, or the new-class line. */
  levelLine: string;
  eligible: boolean;
  /** Unmet multiclass prerequisite text, present only when !eligible. */
  requirement?: string;
}

/**
 * Every selectable target for "which class levels up": the character's own
 * entries (always eligible — retaking your own class has no prerequisite),
 * plus not-yet-owned reference classes gated by multiclassPrereqMet.
 * `referenceClasses` undefined (still loading) yields existing entries only.
 */
export function buildClassChoiceOptions(
  character: Character,
  referenceClasses: ClassOption[] | undefined,
): ClassChoiceOption[] {
  const entries = character.classes ?? [];
  const existing: ClassChoiceOption[] = entries.map((entry) => ({
    target: { kind: "existing", classEntryId: entry.id },
    name: entry.subclass ? `${entry.name} (${entry.subclass})` : entry.name,
    levelLine: `Level ${entry.level} → ${entry.level + 1}`,
    eligible: true,
  }));

  const ownedNames = new Set(entries.map((e) => e.name.toLowerCase()));
  const additions: ClassChoiceOption[] = (referenceClasses ?? [])
    .filter((c) => !ownedNames.has(c.name.toLowerCase()))
    .map((c) => {
      const eligible = multiclassPrereqMet(c.multiclassPrerequisite, character.abilityScores);
      return {
        target: { kind: "new", classId: c.id },
        name: c.name,
        levelLine: "New class — Level 1",
        eligible,
        ...(eligible ? {} : { requirement: c.multiclassPrerequisite?.description }),
      };
    });

  return [...existing, ...additions];
}

/** Eligible-option count — the chooser auto-skips when this is ≤ 1 (#1170). */
export function selectableClassChoiceCount(options: readonly ClassChoiceOption[]): number {
  return options.filter((o) => o.eligible).length;
}

/** Structural equality for two LevelUpTargets — used to preselect a deep-linked option. */
export function sameLevelUpTarget(
  a: LevelUpTarget | null | undefined,
  b: LevelUpTarget,
): boolean {
  if (!a || a.kind !== b.kind) return false;
  return a.kind === "existing" && b.kind === "existing"
    ? a.classEntryId === b.classEntryId
    : a.kind === "new" && b.kind === "new"
      ? a.classId === b.classId
      : false;
}
