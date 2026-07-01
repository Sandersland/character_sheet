import { useReducer } from "react";

import type { FeatImprovement, TakeFeatOperation } from "@/types/character";

export interface StatBonusRow {
  id: number;
  target: string;
  amount: number;
  perLevel: boolean;
}

interface State {
  name: string;
  desc: string;
  statBonuses: StatBonusRow[];
  nextRowId: number;
  grantedSkills: Set<string>;
  grantedSaves: Set<string>;
  abilityOptions: Set<string>;
  abilityIncrease: number;
  abilityChoice: string;
}

type Action =
  | { type: "setName"; value: string }
  | { type: "setDesc"; value: string }
  | { type: "addStatBonus" }
  | { type: "updateStatBonus"; id: number; patch: Partial<StatBonusRow> }
  | { type: "removeStatBonus"; id: number }
  | { type: "toggleSkill"; name: string }
  | { type: "toggleSave"; ability: string }
  | { type: "toggleAbilityOption"; key: string }
  | { type: "setAbilityIncrease"; value: number }
  | { type: "setAbilityChoice"; value: string }
  | { type: "reset" };

const INITIAL: State = {
  name: "",
  desc: "",
  statBonuses: [],
  nextRowId: 0,
  grantedSkills: new Set(),
  grantedSaves: new Set(),
  abilityOptions: new Set(),
  abilityIncrease: 1,
  abilityChoice: "",
};

function toggle(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "setName":
      return { ...state, name: action.value };
    case "setDesc":
      return { ...state, desc: action.value };
    case "addStatBonus":
      return {
        ...state,
        nextRowId: state.nextRowId + 1,
        statBonuses: [...state.statBonuses, { id: state.nextRowId, target: "speed", amount: 0, perLevel: false }],
      };
    case "updateStatBonus":
      return {
        ...state,
        statBonuses: state.statBonuses.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r)),
      };
    case "removeStatBonus":
      return { ...state, statBonuses: state.statBonuses.filter((r) => r.id !== action.id) };
    case "toggleSkill":
      return { ...state, grantedSkills: toggle(state.grantedSkills, action.name) };
    case "toggleSave":
      return { ...state, grantedSaves: toggle(state.grantedSaves, action.ability) };
    case "toggleAbilityOption": {
      const abilityOptions = toggle(state.abilityOptions, action.key);
      return {
        ...state,
        abilityOptions,
        abilityChoice: abilityOptions.size <= 1 ? "" : state.abilityChoice,
      };
    }
    case "setAbilityIncrease":
      return { ...state, abilityIncrease: action.value };
    case "setAbilityChoice":
      return { ...state, abilityChoice: action.value };
    case "reset":
      return INITIAL;
    default:
      return state;
  }
}

export interface CustomFeatDraft {
  name: string;
  desc: string;
  statBonuses: StatBonusRow[];
  grantedSkills: Set<string>;
  grantedSaves: Set<string>;
  abilityOptions: Set<string>;
  abilityIncrease: number;
  abilityChoice: string;
  setName: (value: string) => void;
  setDesc: (value: string) => void;
  addStatBonus: () => void;
  updateStatBonus: (id: number, patch: Partial<StatBonusRow>) => void;
  removeStatBonus: (id: number) => void;
  toggleSkill: (name: string) => void;
  toggleSave: (ability: string) => void;
  toggleAbilityOption: (key: string) => void;
  setAbilityIncrease: (value: number) => void;
  setAbilityChoice: (value: string) => void;
  reset: () => void;
  submitDisabled: (busy: boolean) => boolean;
  buildOperation: () => TakeFeatOperation | null;
}

export function useCustomFeatDraft(): CustomFeatDraft {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const abilityOptionsArr = Array.from(state.abilityOptions);

  return {
    name: state.name,
    desc: state.desc,
    statBonuses: state.statBonuses,
    grantedSkills: state.grantedSkills,
    grantedSaves: state.grantedSaves,
    abilityOptions: state.abilityOptions,
    abilityIncrease: state.abilityIncrease,
    abilityChoice: state.abilityChoice,
    setName: (value) => dispatch({ type: "setName", value }),
    setDesc: (value) => dispatch({ type: "setDesc", value }),
    addStatBonus: () => dispatch({ type: "addStatBonus" }),
    updateStatBonus: (id, patch) => dispatch({ type: "updateStatBonus", id, patch }),
    removeStatBonus: (id) => dispatch({ type: "removeStatBonus", id }),
    toggleSkill: (name) => dispatch({ type: "toggleSkill", name }),
    toggleSave: (ability) => dispatch({ type: "toggleSave", ability }),
    toggleAbilityOption: (key) => dispatch({ type: "toggleAbilityOption", key }),
    setAbilityIncrease: (value) => dispatch({ type: "setAbilityIncrease", value }),
    setAbilityChoice: (value) => dispatch({ type: "setAbilityChoice", value }),
    reset: () => dispatch({ type: "reset" }),
    submitDisabled: (busy) => {
      const needsChoice = abilityOptionsArr.length > 1 && !state.abilityChoice;
      return !state.name.trim() || needsChoice || busy;
    },
    buildOperation: () => {
      if (!state.name.trim()) return null;
      const improvements: FeatImprovement[] = [
        ...state.statBonuses
          .filter((r) => r.amount > 0)
          .map((r): FeatImprovement => ({
            target: r.target,
            amount: r.amount,
            ...(r.perLevel ? { perLevel: true } : {}),
          })),
        ...Array.from(state.grantedSkills).map((name): FeatImprovement => ({ target: "skillProficiency", amount: 1, key: name })),
        ...Array.from(state.grantedSaves).map((ability): FeatImprovement => ({ target: "savingThrowProficiency", amount: 1, key: ability })),
      ];
      const needsChoice = abilityOptionsArr.length > 1;
      const chosenAbility = abilityOptionsArr.length === 1 ? abilityOptionsArr[0] : state.abilityChoice;
      if (needsChoice && !chosenAbility) return null;
      return {
        type: "takeFeat",
        custom: {
          name: state.name.trim(),
          description: state.desc,
          improvements: improvements.length > 0 ? improvements : undefined,
          abilityOptions: abilityOptionsArr.length > 0 ? abilityOptionsArr : undefined,
          abilityIncrease: abilityOptionsArr.length > 0 ? state.abilityIncrease : undefined,
        },
        abilityChoice: abilityOptionsArr.length > 0 ? chosenAbility : undefined,
      };
    },
  };
}
