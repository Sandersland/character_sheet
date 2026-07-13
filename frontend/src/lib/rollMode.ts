// Pure resolver for state-driven advantage/disadvantage (#486). Given the
// character's derived `rollModifiers` (from active conditions + buffs), the roll
// category being made, and the sticky manual toggle (#459), it returns the
// effective RollMode plus the matched sources so a surface can render a "why" chip.
//
// RAW: advantage + disadvantage from different sources cancel to a straight roll.
// The manual toggle is an explicit player override — it wins over the auto mode.

import type { RollMode } from "@/lib/dice";
import type { RollModeKind, RollModifier } from "@/types/character";

/** The roll being made: one of the four categories, optionally narrowed to an ability. */
export interface RollCategory {
  kind: RollModeKind;
  /** Governing ability (lowercase key) for check/save rolls; omitted for attack/initiative. */
  ability?: string;
}

export interface ResolvedRollMode {
  mode: RollMode;
  /** The modifiers that applied to this roll — drives the source chip. Empty on a manual override. */
  sources: RollModifier[];
}

// A modifier applies when its kind matches and, if it names an ability, that ability matches.
function applies(mod: RollModifier, category: RollCategory): boolean {
  if (mod.kind !== category.kind) return false;
  if (mod.ability !== undefined && mod.ability !== category.ability) return false;
  return true;
}

export function resolveRollMode(
  rollModifiers: RollModifier[],
  category: RollCategory,
  manualMode: RollMode = "normal",
): ResolvedRollMode {
  // The manual toggle short-circuits every auto grant (acceptance criterion #4).
  if (manualMode !== "normal") return { mode: manualMode, sources: [] };

  const sources = rollModifiers.filter((m) => applies(m, category));
  const hasAdvantage = sources.some((m) => m.mode === "advantage");
  const hasDisadvantage = sources.some((m) => m.mode === "disadvantage");
  const mode: RollMode =
    hasAdvantage && hasDisadvantage
      ? "normal"
      : hasAdvantage
        ? "advantage"
        : hasDisadvantage
          ? "disadvantage"
          : "normal";
  return { mode, sources };
}

// Short "why" text for the resolved chip, e.g. "disadvantage — Poisoned" or,
// when adv + disadv cancel, "normal — Rage vs Poisoned". Empty when nothing applied.
export function rollModeChip(resolved: ResolvedRollMode): string {
  if (resolved.sources.length === 0) return "";
  const names = [...new Set(resolved.sources.map((s) => s.source))].join(", ");
  return `${resolved.mode} — ${names}`;
}
