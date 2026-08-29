import type { CharacterDraft } from "@/hooks/useCharacterDraft";
import type { BackgroundOption, ClassOption } from "@/types/character";

interface ToolProficiencyChoicesArgs {
  draft: CharacterDraft;
  selectedClass: ClassOption | undefined;
  selectedBackground: BackgroundOption | undefined;
  update: (patch: Partial<CharacterDraft>) => void;
}

export interface ToolChoiceGroup {
  label: string;
  options: string[];
  max: number;
  selected: string[];
  toggle: (name: string) => void;
}

export interface ToolProficiencyChoices {
  grantedToolProfs: string[];
  classChoices: ToolChoiceGroup;
  backgroundChoices: ToolChoiceGroup;
}

export function useToolProficiencyChoices({
  draft,
  selectedClass,
  selectedBackground,
  update,
}: ToolProficiencyChoicesArgs): ToolProficiencyChoices {
  const backgroundToolProfs = draft.useCustomBackground ? [] : (selectedBackground?.toolProficiencies ?? []);
  const grantedToolProfs = [
    ...backgroundToolProfs,
    ...(selectedClass?.toolProficiencies ?? []),
  ].filter((name, idx, arr) => arr.indexOf(name) === idx);

  const classOptions = (selectedClass?.toolChoices ?? []).filter(
    (name) => !grantedToolProfs.includes(name)
  );
  const classMax = selectedClass?.toolChoiceCount ?? 0;
  const classSelected = draft.toolChoices.filter((t) => classOptions.includes(t));

  function toggleClassToolChoice(name: string) {
    const isSelected = classSelected.includes(name);
    if (isSelected) {
      update({ toolChoices: draft.toolChoices.filter((t) => t !== name) });
    } else if (classSelected.length < classMax) {
      update({ toolChoices: [...draft.toolChoices, name] });
    }
  }

  const backgroundOptions = draft.useCustomBackground
    ? []
    : (selectedBackground?.toolChoices ?? []).filter((name) => !grantedToolProfs.includes(name));
  const backgroundMax = draft.useCustomBackground ? 0 : (selectedBackground?.toolChoiceCount ?? 0);
  const backgroundSelected = draft.backgroundToolChoices.filter((t) => backgroundOptions.includes(t));

  function toggleBackgroundToolChoice(name: string) {
    const isSelected = backgroundSelected.includes(name);
    if (isSelected) {
      update({ backgroundToolChoices: draft.backgroundToolChoices.filter((t) => t !== name) });
    } else if (backgroundSelected.length < backgroundMax) {
      update({ backgroundToolChoices: [...draft.backgroundToolChoices, name] });
    }
  }

  return {
    grantedToolProfs,
    classChoices: {
      label: "Class",
      options: classOptions,
      max: classMax,
      selected: classSelected,
      toggle: toggleClassToolChoice,
    },
    backgroundChoices: {
      label: "Background",
      options: backgroundOptions,
      max: backgroundMax,
      selected: backgroundSelected,
      toggle: toggleBackgroundToolChoice,
    },
  };
}
