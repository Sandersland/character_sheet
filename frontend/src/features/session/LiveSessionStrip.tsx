/**
 * The desktop live-session strip (#961/#1026): a slim garnet cue shown under the
 * banner on non-Combat tabs while a session is live and this character is in it,
 * with a one-tap in-workspace jump to the Combat tab (no navigate-away).
 *
 * Desktop only (`hidden md:flex`). On mobile the compact header's live pill
 * carries live state now, so no full-width strip (#1026). Presentational: the
 * host (CharacterSheetContent) decides visibility off `useLiveSession()`.
 */

interface LiveSessionStripProps {
  /** Session title, or null → a generic "Session live" label. */
  title: string | null;
  /** Current round (from useLiveRound), or null when not in combat. */
  round: number | null;
  /** Switch to the Combat tab (in-workspace, no navigation). */
  onGoToCombat: () => void;
}

export default function LiveSessionStrip({ title, round, onGoToCombat }: LiveSessionStripProps) {
  return (
    <button
      type="button"
      onClick={onGoToCombat}
      className="hidden w-full items-center gap-3 border-b border-garnet-800 bg-gradient-to-r from-garnet-700 to-garnet-900 px-4 py-2 text-left text-parchment-50 transition-colors hover:from-garnet-800 hover:to-garnet-900 md:flex"
    >
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-vitality-400" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
        {title ?? "Session live"}
        {round !== null && <span className="font-normal text-garnet-100"> · Round {round}</span>}
      </span>
      <span className="shrink-0 text-xs font-semibold text-garnet-100">Go to fight ›</span>
    </button>
  );
}
