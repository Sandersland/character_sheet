/* eslint-disable react-refresh/only-export-components -- provider module co-exports its use* hook beside the component; same-file hook+provider is intentional, HMR-only caveat */
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
