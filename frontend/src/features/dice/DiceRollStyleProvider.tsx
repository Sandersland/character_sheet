/* eslint-disable react-refresh/only-export-components */
/**
 * App-wide dice-roll presentation context (#945). Persists the player's
 * Animated (3D) vs Quick (compact chip) preference via useDiceRollStyle,
 * mirroring ThemeProvider. `useDiceRollStyle()` degrades to the `animated`
 * default outside a provider so roll-context test harnesses need no wrapper.
 */

import { createContext, useContext, type ReactNode } from "react";

import { useDiceRollStylePreference, type DiceRollStyle } from "@/hooks/useDiceRollStyle";

interface DiceRollStyleContextValue {
  style: DiceRollStyle;
  setStyle: (value: DiceRollStyle) => void;
}

const DiceRollStyleContext = createContext<DiceRollStyleContextValue | null>(null);

export function DiceRollStyleProvider({ children }: { children: ReactNode }) {
  const [style, setStyle] = useDiceRollStylePreference();
  return (
    <DiceRollStyleContext.Provider value={{ style, setStyle }}>
      {children}
    </DiceRollStyleContext.Provider>
  );
}

export function useDiceRollStyle(): DiceRollStyleContextValue {
  const ctx = useContext(DiceRollStyleContext);
  return ctx ?? { style: "animated", setStyle: () => {} };
}
