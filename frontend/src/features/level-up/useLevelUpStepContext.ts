// Shared channel from the ceremony shell to its step bodies (#887–#896): bodies
// stay registered as ComponentType<{ step }> so sibling steps only ever add a
// STEP_BODIES map entry — draft access comes from here, never new props.

import { createContext, useContext } from "react";

import type { LevelUpDraft } from "@/lib/levelUpSteps";
import type { Character, LevelUpPlanResponse, LevelUpTarget } from "@/types/character";

export interface LevelUpStepContextValue {
  character: Character;
  draft: LevelUpDraft;
  setDraft: React.Dispatch<React.SetStateAction<LevelUpDraft>>;
  /** Non-null: the provider mounts only inside the shell's plan-loaded branch. */
  plan: LevelUpPlanResponse;
  /** Which class entry/new-class this ceremony instance advances (#1170). */
  target: LevelUpTarget;
}

export const LevelUpStepContext = createContext<LevelUpStepContextValue | null>(null);

export function useLevelUpStepContext(): LevelUpStepContextValue {
  const ctx = useContext(LevelUpStepContext);
  if (!ctx) throw new Error("useLevelUpStepContext must be used inside the level-up ceremony");
  return ctx;
}
