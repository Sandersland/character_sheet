// Pure planning logic for the weapon-row maneuver prompt — extracted from
// ManeuverPrompt (#689). No JSX.
//
// Only maneuvers whose placement is "attackRoll" or "damageRoll" belong in a
// weapon row (they augment THIS weapon's rolls). "attackOption" (Commander's
// Strike), "reaction" (Parry/Riposte), and "effect" (Evasive Footwork) are
// handled at the TurnHub / InlineAttackPicker level and never appear here.
import type { ManeuverEntry, ManeuverPlacement } from "@/types/character";

/** Placement of a known maneuver; custom/legacy entries default to damageRoll. */
export function maneuverPlacement(m: ManeuverEntry): ManeuverPlacement {
  return m.placement ?? "damageRoll";
}

export interface ManeuverPromptPlan {
  attackRollManeuvers: ManeuverEntry[];
  damageRollManeuvers: ManeuverEntry[];
  /** Section visibility: the matching roll was made AND a maneuver applies. */
  showAttackSection: boolean;
  showDamageSection: boolean;
  /** True when the prompt should render at all. */
  visible: boolean;
}

export function planManeuverPrompt(
  maneuversKnown: ManeuverEntry[],
  hasAttackRoll: boolean,
  hasDamageRoll: boolean,
): ManeuverPromptPlan {
  const attackRollManeuvers = maneuversKnown.filter((m) => maneuverPlacement(m) === "attackRoll");
  const damageRollManeuvers = maneuversKnown.filter((m) => maneuverPlacement(m) === "damageRoll");
  const showAttackSection = hasAttackRoll && attackRollManeuvers.length > 0;
  const showDamageSection = hasDamageRoll && damageRollManeuvers.length > 0;
  return {
    attackRollManeuvers,
    damageRollManeuvers,
    showAttackSection,
    showDamageSection,
    visible: showAttackSection || showDamageSection,
  };
}

/** The active damage-maneuver name — falls back to the first when the stored selection is stale. */
export function resolveDamageSelection(damageRollManeuvers: ManeuverEntry[], selected: string): string {
  return damageRollManeuvers.some((m) => m.name === selected)
    ? selected
    : (damageRollManeuvers[0]?.name ?? "");
}

/** Render gate: a Battle Master with dice left and at least one known maneuver. */
export function canPromptManeuvers(
  pool: { total: number; remaining: number } | null | undefined,
  maneuversKnown: ManeuverEntry[],
): boolean {
  return Boolean(pool && pool.total > 0 && pool.remaining > 0 && maneuversKnown.length > 0);
}
