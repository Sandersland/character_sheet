import type { SessionDoorwaySummary } from "@/features/session/sessionDoorwaySummary";

interface SessionDoorwayProps {
  summary: SessionDoorwaySummary;
  /** Full state for the aria-label, e.g. the chapter title. */
  sessionTitle?: string | null;
  pending: boolean;
  /** Inline action error (start/join failure). */
  error: string | null;
  onAction: () => void;
  /**
   * Mobile: a slim in-flow bar between the panels and the bottom nav.
   * Desktop: a strip pinned under the garnet banner, at content width.
   */
  placement: "mobile" | "desktop";
}

// Per-tone chrome. `live` = act now (garnet gradient); `scheduled` = informational
// (parchment + gold); `invite` = a DM's quiet dashed empty-state. Color never
// carries meaning alone — the label always states the action.
const TONE_INTERACTIVE: Record<SessionDoorwaySummary["tone"], string> = {
  live: "bg-gradient-to-r from-garnet-700 to-garnet-900 text-parchment-50 hover:from-garnet-800 hover:to-garnet-900",
  scheduled: "border border-gold-300 bg-gold-50 text-parchment-800 hover:bg-gold-100",
  invite: "border border-dashed border-parchment-300 bg-parchment-50 text-garnet-700 hover:bg-parchment-100",
};

const TONE_STATIC: Record<SessionDoorwaySummary["tone"], string> = {
  live: "bg-gradient-to-r from-garnet-700 to-garnet-900 text-parchment-50",
  scheduled: "border border-gold-300 bg-gold-50 text-parchment-800",
  invite: "border border-dashed border-parchment-300 bg-parchment-50 text-garnet-700",
};

/**
 * The sheet's one always-visible, state-aware session doorway (#942) — a dumb
 * renderer of the summary from useSessionDoorway. Renders nothing when the
 * summary is hidden (solo character, or a player with nothing to act on), so its
 * height is reclaimed rather than left as a disabled bar. Not a swipe target.
 */
export default function SessionDoorway({
  summary,
  sessionTitle,
  pending,
  error,
  onAction,
  placement,
}: SessionDoorwayProps) {
  if (!summary.visible) return null;

  // The full state, spoken for screen readers: "Resume session, Round 3, The Sunless Citadel".
  const ariaLabel = [summary.label, summary.sub, sessionTitle].filter(Boolean).join(", ");

  const wrapper =
    placement === "mobile"
      ? "shrink-0 border-t border-parchment-200 bg-parchment-50 px-3 py-2 md:hidden"
      : "hidden border-b border-parchment-200 bg-parchment-100 md:block";

  const inner =
    placement === "mobile" ? "" : "mx-auto max-w-6xl px-6 py-2";

  const barBase =
    "flex w-full items-center justify-center gap-2 rounded-control px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600 focus-visible:ring-offset-1";

  const content = (
    <span className="flex min-w-0 items-baseline justify-center gap-2">
      <span className="truncate">{summary.label}</span>
      {summary.sub && (
        <span className="flex-none font-display text-xs font-semibold opacity-90">· {summary.sub}</span>
      )}
    </span>
  );

  return (
    <div className={wrapper}>
      <div className={inner}>
        {summary.action !== null ? (
          <button
            type="button"
            aria-label={ariaLabel}
            disabled={pending}
            onClick={onAction}
            className={`${barBase} ${TONE_INTERACTIVE[summary.tone]} disabled:opacity-60`}
          >
            {content}
          </button>
        ) : (
          // Informational (scheduled, player) — no button, just the strip.
          <div role="status" aria-label={ariaLabel} className={`${barBase} ${TONE_STATIC[summary.tone]}`}>
            {content}
          </div>
        )}
        {error && (
          <p className="mt-1 text-center text-[11px] font-semibold text-garnet-700">{error}</p>
        )}
      </div>
    </div>
  );
}
