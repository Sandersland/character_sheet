import type { CatalogFeat } from "@/types/character";

export interface FeatView {
  search: string;
  selectedFeat: CatalogFeat | null;
  abilityChoice: string;
  customMode: boolean;
}

export type FeatViewAction =
  | { type: "select"; feat: CatalogFeat }
  | { type: "back" }
  | { type: "setSearch"; value: string }
  | { type: "setAbilityChoice"; value: string }
  | { type: "enterCustom" }
  | { type: "exitCustom" }
  | { type: "reset" };

export const FEAT_VIEW_INITIAL: FeatView = { search: "", selectedFeat: null, abilityChoice: "", customMode: false };

export function featViewReducer(state: FeatView, action: FeatViewAction): FeatView {
  switch (action.type) {
    case "select":
      return {
        ...state,
        selectedFeat: action.feat,
        abilityChoice: action.feat.abilityOptions.length === 1 ? action.feat.abilityOptions[0] : "",
        customMode: false,
        search: "",
      };
    case "back":
      return { ...state, selectedFeat: null, abilityChoice: "" };
    case "setSearch":
      return { ...state, search: action.value };
    case "setAbilityChoice":
      return { ...state, abilityChoice: action.value };
    case "enterCustom":
      return { ...state, customMode: true };
    case "exitCustom":
      return { ...state, customMode: false };
    case "reset":
      return { ...state, selectedFeat: null, abilityChoice: "", customMode: false };
    default:
      return state;
  }
}
