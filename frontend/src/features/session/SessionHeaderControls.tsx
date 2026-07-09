/**
 * SessionHeaderControls — the SessionTopBar's right-hand cluster: BackendStatus
 * plus the Note / Leave / End Session buttons and the leave-error line.
 */

import BackendStatus from "@/features/character-meta/BackendStatus";

interface SessionHeaderControlsProps {
  controlsBusy: boolean;
  leaveError: string | null;
  onCapture: () => void;
  onLeave: () => void;
  onEndClick: () => void;
}

export default function SessionHeaderControls({
  controlsBusy,
  leaveError,
  onCapture,
  onLeave,
  onEndClick,
}: SessionHeaderControlsProps) {
  return (
    <div className="flex flex-col items-end gap-2">
      <BackendStatus />
      <div className="flex items-center gap-2">
        {/* Visible quick-capture affordance (#274) — opens the same palette as Cmd/Ctrl+J. */}
        <button
          type="button"
          onClick={onCapture}
          className="rounded-control border border-arcane-700 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-arcane-700 transition-colors hover:bg-arcane-50"
        >
          ＋ Note
        </button>
        <button
          type="button"
          disabled={controlsBusy}
          onClick={onLeave}
          className="rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100 disabled:opacity-50"
        >
          Leave Session
        </button>
        <button
          type="button"
          disabled={controlsBusy}
          onClick={onEndClick}
          className="rounded-control border border-garnet-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-garnet-700 transition-colors hover:bg-garnet-50 disabled:opacity-50"
        >
          End Session
        </button>
      </div>
      {leaveError && <p className="text-right text-xs text-garnet-700">{leaveError}</p>}
    </div>
  );
}
