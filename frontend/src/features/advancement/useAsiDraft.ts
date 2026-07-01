import { useReducer } from "react";

import type { TakeAsiOperation } from "@/types/character";

const ABILITY_CAP = 20;

type State = { increases: Record<string, number> };

type Action =
  | { type: "adjust"; ability: string; delta: number; currentScore: number }
  | { type: "reset" };

function total(increases: Record<string, number>): number {
  return Object.values(increases).reduce((s, v) => s + v, 0);
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "adjust": {
      const { ability, delta, currentScore } = action;
      const current = state.increases[ability] ?? 0;
      const next = current + delta;
      if (next < 0 || next > 2) return state;
      if (currentScore + next > ABILITY_CAP) return state;
      if (total(state.increases) - current + next > 2) return state;
      return { increases: { ...state.increases, [ability]: next } };
    }
    case "reset":
      return { increases: {} };
    default:
      return state;
  }
}

export interface AsiDraft {
  increases: Record<string, number>;
  totalPoints: number;
  pointsLeft: number;
  adjust: (ability: string, delta: number, currentScore: number) => void;
  buildOperation: () => TakeAsiOperation;
  reset: () => void;
}

export function useAsiDraft(): AsiDraft {
  const [state, dispatch] = useReducer(reducer, { increases: {} });
  const totalPoints = total(state.increases);

  return {
    increases: state.increases,
    totalPoints,
    pointsLeft: 2 - totalPoints,
    adjust: (ability, delta, currentScore) =>
      dispatch({ type: "adjust", ability, delta, currentScore }),
    buildOperation: () => ({
      type: "takeAsi",
      increases: Object.entries(state.increases)
        .filter(([, v]) => v > 0)
        .map(([ability, amount]) => ({ ability, amount: amount as 1 | 2 })),
    }),
    reset: () => dispatch({ type: "reset" }),
  };
}
