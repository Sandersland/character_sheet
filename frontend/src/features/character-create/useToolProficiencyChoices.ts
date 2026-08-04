import type { CharacterDraft } from "@/hooks/useCharacterDraft";
import type { BackgroundOption, ClassOption } from "@/types/character";

interface ToolProficiencyChoicesArgs {
  draft: CharacterDraft;
  selectedClass: ClassOption | undefined;
  selectedBackground: BackgroundOption | undefined;
  update: (patch: Partial<CharacterDraft>) => void;
}

export interface ToolProficiencyChoices {
  grantedToolProfs: string[];
  toolChoiceOptions: string[];
  maxToolChoices: number;
  selectedToolChoices: string[];
  toggleToolChoice: (name: string) => void;
}

// Granted = fixed from background/class (read-only); choices = player-selectable from class up to the cap.
// No species/race source: the flat Race model never actually seeded a
// toolProficiencies row (confirmed empty, #1684) and no species-granted
// tool-proficiency mechanism exists yet either.
export function useToolProficiencyChoices({
  draft,
  selectedClass,
  selectedBackground,
  update,
}: ToolProficiencyChoicesArgs): ToolProficiencyChoices {
  const grantedToolProfs = [
    ...(draft.useCustomBackground ? [] : selectedBackground?.toolProficiencies ?? []),
    ...(selectedClass?.toolProficiencies ?? []),
  ].filter((name, idx, arr) => arr.indexOf(name) === idx);

  const toolChoiceOptions = (selectedClass?.toolChoices ?? []).filter(
    (name) => !grantedToolProfs.includes(name)
  );
  const maxToolChoices = selectedClass?.toolChoiceCount ?? 0;
  const selectedToolChoices = draft.toolChoices.filter((t) => toolChoiceOptions.includes(t));

  function toggleToolChoice(name: string) {
    const isSelected = selectedToolChoices.includes(name);
    if (isSelected) {
      update({ toolChoices: draft.toolChoices.filter((t) => t !== name) });
    } else if (selectedToolChoices.length < maxToolChoices) {
      update({ toolChoices: [...draft.toolChoices, name] });
    }
  }

  return { grantedToolProfs, toolChoiceOptions, maxToolChoices, selectedToolChoices, toggleToolChoice };
}
