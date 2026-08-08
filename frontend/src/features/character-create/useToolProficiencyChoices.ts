import type { CharacterDraft } from "@/hooks/useCharacterDraft";
import type { BackgroundOption, ClassOption } from "@/types/character";

interface ToolProficiencyChoicesArgs {
  draft: CharacterDraft;
  selectedClass: ClassOption | undefined;
  selectedBackground: BackgroundOption | undefined;
  update: (patch: Partial<CharacterDraft>) => void;
}

/** One independent tool-choice pick group — the class's own pool/cap, or
 *  (#1779) the background's own, rendered as its own labeled group rather
 *  than merged into one pool (settled in #1779: separate 5e quotas). */
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

// Granted = fixed from background/class (read-only); choices = player-selectable,
// each source's own pool up to its own cap. No species/race source: the flat
// Race model never actually seeded a toolProficiencies row (confirmed empty,
// #1684) and no species-granted tool-proficiency mechanism exists yet either.
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

  // #1779: the background's own pool/cap — inert (no options, no cap) for a
  // custom background, same rule grantedToolProfs already applies above.
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
