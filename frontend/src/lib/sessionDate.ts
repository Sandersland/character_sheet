/** Used by both CombatLogRow's idle row and CombatLivePanel's log overlay subtitle. */
export function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
