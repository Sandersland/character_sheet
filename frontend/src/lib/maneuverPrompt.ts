// Only attackRoll/damageRoll maneuvers belong in a weapon row; attackOption/reaction/effect are handled by TurnHub/InlineAttackPicker.
import type { ManeuverEntry, ManeuverPlacement } from "@/types/character";

export function maneuverPlacement(m: ManeuverEntry): ManeuverPlacement {
  return m.placement ?? "damageRoll";
}

export interface ManeuverPromptPlan {
  attackRollManeuvers: ManeuverEntry[];
  damageRollManeuvers: ManeuverEntry[];
  showAttackSection: boolean;
  showDamageSection: boolean;
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

export function resolveDamageSelection(damageRollManeuvers: ManeuverEntry[], selected: string): string {
  return damageRollManeuvers.some((m) => m.name === selected)
    ? selected
    : (damageRollManeuvers[0]?.name ?? "");
}

export function canPromptManeuvers(
  pool: { total: number; remaining: number } | null | undefined,
  maneuversKnown: ManeuverEntry[],
): boolean {
  return Boolean(pool && pool.total > 0 && pool.remaining > 0 && maneuversKnown.length > 0);
}
