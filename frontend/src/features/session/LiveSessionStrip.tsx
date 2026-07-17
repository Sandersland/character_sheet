/**
 * The live-session strip (#961): a slim garnet cue shown on non-Combat tabs
 * while a session is live and this character is in it, with a one-tap in-
 * workspace jump to the Combat tab (no navigate-away). On the Combat tab it's
 * suppressed — you're already there, and the panel carries its own header (D4).
 *
 * Presentational: the host (CharacterSheetContent) decides visibility off
 * `useLiveSession()`/`useLiveRound()` and passes the tab switch.
 */

interface LiveSessionStripProps {
  /** Session title, or null → a generic "Session live" label. */
  title: string | null;
  /** Current round (from useLiveRound), or null when not in combat. */
  round: number | null;
  /** Slim in-flow bar on mobile vs. under-banner strip on desktop. */
  placement: "mobile" | "desktop";
  /** Switch to the Combat tab (in-workspace, no navigation). */
  onGoToCombat: () => void;
}

export default function LiveSessionStrip({ title, round, placement, onGoToCombat }: LiveSessionStripProps) {
  const wrap =
    placement === "mobile"
      ? "flex flex-none md:hidden"
      : "hidden md:flex";
  return (
    <button
      type="button"
      onClick={onGoToCombat}
      className={`${wrap} w-full items-center gap-3 border-b border-garnet-800 bg-gradient-to-r from-garnet-700 to-garnet-900 px-4 py-2 text-left text-parchment-50 transition-colors hover:from-garnet-800 hover:to-garnet-900`}
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
