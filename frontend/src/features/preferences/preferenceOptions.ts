import { Dices, Monitor, Moon, Sun, Zap, type LucideIcon } from "lucide-react";

import type { DiceRollStyle } from "@/hooks/useDiceRollStyle";
import type { ThemePreference } from "@/hooks/useThemePreference";

export interface PreferenceOption<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
}

// Single source for label/icon/order — both AccountMenu's quick shortcuts and
// the full PreferencesSheet (#1167) render from these so the two can't drift.
export const THEME_OPTIONS: PreferenceOption<ThemePreference>[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export const DICE_OPTIONS: PreferenceOption<DiceRollStyle>[] = [
  { value: "animated", label: "Animated", icon: Dices },
  { value: "quick", label: "Quick", icon: Zap },
];
