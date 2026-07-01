import type { CharacterDraft } from "@/hooks/useCharacterDraft";
import type { BackgroundOption, ClassOption, RaceOption } from "@/types/character";

interface ToolProficiencyChoicesArgs {
  draft: CharacterDraft;
  selectedClass: ClassOption | undefined;
  selectedRace: RaceOption | undefined;
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

// Granted = fixed from background/class/race (read-only); choices = player-selectable from class up to the cap.
export function useToolProficiencyChoices({
  draft,
  selectedClass,
  selectedRace,
  selectedBackground,
  update,
}: ToolProficiencyChoicesArgs): ToolProficiencyChoices {
  const grantedToolProfs = [
    ...(draft.useCustomBackground ? [] : selectedBackground?.toolProficiencies ?? []),
    ...(selectedClass?.toolProficiencies ?? []),
    ...(selectedRace?.toolProficiencies ?? []),
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
