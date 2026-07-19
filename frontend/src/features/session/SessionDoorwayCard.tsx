import { useSessionDoorway } from "@/features/session/useSessionDoorway";

interface SessionDoorwayCardProps {
  characterId: string;
  /** Called after a successful start/join; defaults to a no-op (idle Combat is
   *  already the active tab, so the live panel supersedes in place). */
  onEnterCombat?: () => void;
}

/**
 * The idle Combat tab's doorway card (#1086) — the turn-slot placeholder when no
 * session is live. Reads `useSessionDoorway` directly (no prop threading) so it
 * dispatches start/join off the shared live-session state and disables/errors
 * inline. When the summary offers no action (a player with nothing to start), the
 * card is informational only.
 */
export default function SessionDoorwayCard({ characterId, onEnterCombat }: SessionDoorwayCardProps) {
  const { summary, pending, error, onAction } = useSessionDoorway(characterId, onEnterCombat);
  const actionLabel = summary.action === "join" ? "Join session" : "Start session";

  return (
    <div className="rounded-card border border-parchment-200 bg-parchment-50 p-6 text-center shadow-card">
      <h2 className="font-display text-xl font-semibold text-parchment-900">No session live</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-parchment-600">
        Start a session to track turns, actions, and rolls — solo or with your party.
      </p>
      {summary.action !== null && (
        <button
          type="button"
          disabled={pending}
          onClick={onAction}
          className="mt-4 inline-flex items-center justify-center rounded-control bg-garnet-800 px-5 py-2.5 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600 focus-visible:ring-offset-1 disabled:opacity-60"
        >
          {actionLabel}
        </button>
      )}
      {error && <p className="mt-2 text-[11px] font-semibold text-garnet-700">{error}</p>}
    </div>
  );
}
