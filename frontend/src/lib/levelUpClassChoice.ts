import { multiclassPrereqMet } from "@/lib/multiclass";
import type { Character, ClassOption, LevelUpTarget } from "@/types/character";

export interface ClassChoiceOption {
  target: LevelUpTarget;
  name: string;
  levelLine: string;
  eligible: boolean;
  // Present only when !eligible.
  requirement?: string;
}

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

// The chooser auto-skips when this is ≤ 1.
export function selectableClassChoiceCount(options: readonly ClassChoiceOption[]): number {
  return options.filter((o) => o.eligible).length;
}

function targetId(target: LevelUpTarget): string {
  return target.kind === "existing" ? target.classEntryId : target.classId;
}

export function sameLevelUpTarget(
  a: LevelUpTarget | null | undefined,
  b: LevelUpTarget,
): boolean {
  return a != null && a.kind === b.kind && targetId(a) === targetId(b);
}

// Trusts the deep link unless it's found among the options and POSITIVELY confirmed ineligible; a deep link absent from the options is trusted as-is, since absence isn't evidence of ineligibility.
export function resolveAutoSkipTarget(
  deepLinkTarget: LevelUpTarget | null,
  options: readonly ClassChoiceOption[],
): LevelUpTarget | null {
  const deepLinkOption = options.find((o) => sameLevelUpTarget(deepLinkTarget, o.target));
  if (deepLinkOption && !deepLinkOption.eligible) {
    return options.find((o) => o.eligible)?.target ?? null;
  }
  return deepLinkTarget;
}
