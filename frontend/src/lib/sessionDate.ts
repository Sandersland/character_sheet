/** A session's fallback display label when it has no `title` — used by both
 *  CombatLogRow's idle row and CombatLivePanel's log overlay subtitle (#1237 §10). */
export function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
