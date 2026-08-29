// RAW: advantage + disadvantage from different sources cancel to a straight roll; a manual toggle is an explicit override that wins over the auto mode.
import type { RollMode } from "@/lib/dice";
import type { RollModeKind, RollModifier } from "@/types/character";

export interface RollCategory {
  kind: RollModeKind;
  /** Governing ability (lowercase key) for check/save rolls; omitted for attack/initiative. */
  ability?: string;
}

export interface ResolvedRollMode {
  mode: RollMode;
  /** Sum of the flat d20 modifiers that applied (e.g. exhaustion's −2×level); folded into the roll spec's modifier, and deliberately outside the adv/dis cancel math — a flat penalty survives a manual override. */
  modifier: number;
  /** The modifiers that applied to this roll — drives the source chip. On a manual override, only the flat sources survive. */
  sources: RollModifier[];
}

function applies(mod: RollModifier, category: RollCategory): boolean {
  if (mod.kind !== category.kind) return false;
  if (mod.ability !== undefined && mod.ability !== category.ability) return false;
  return true;
}

function sumFlat(mods: RollModifier[]): number {
  return mods.reduce((sum, m) => (m.mode === "flat" ? sum + m.modifier : sum), 0);
}

export function resolveRollMode(
  rollModifiers: RollModifier[],
  category: RollCategory,
  manualMode: RollMode = "normal",
): ResolvedRollMode {
  const applicable = rollModifiers.filter((m) => applies(m, category));
  const flat = applicable.filter((m) => m.mode === "flat");
  const modifier = sumFlat(flat);

  // The manual toggle short-circuits the auto adv/dis grants but NOT the flat penalty — an override picks a die-count axis, not a bonus.
  if (manualMode !== "normal") return { mode: manualMode, modifier, sources: flat };

  const hasAdvantage = applicable.some((m) => m.mode === "advantage");
  const hasDisadvantage = applicable.some((m) => m.mode === "disadvantage");
  const mode: RollMode =
    hasAdvantage && hasDisadvantage
      ? "normal"
      : hasAdvantage
        ? "advantage"
        : hasDisadvantage
          ? "disadvantage"
          : "normal";
  return { mode, modifier, sources: applicable };
}

// Signed display for a flat modifier, e.g. "+2" / "−4" (Unicode minus).
function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}

export function rollModeChip(resolved: ResolvedRollMode): string {
  if (resolved.sources.length === 0) return "";
  const names = [...new Set(resolved.sources.map((s) => s.source))].join(", ");
  const parts = [
    ...(resolved.mode !== "normal" ? [resolved.mode] : []),
    ...(resolved.modifier !== 0 ? [formatSigned(resolved.modifier)] : []),
  ];
  const prefix = parts.length > 0 ? parts.join(" ") : resolved.mode;
  return `${prefix} — ${names}`;
}
