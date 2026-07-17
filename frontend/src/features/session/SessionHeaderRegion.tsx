/**
 * SessionHeaderRegion — the live-Combat panel's session-controls strip.
 *
 * The tracker lives INSIDE the sheet workspace (#960), whose own header already
 * owns character identity + the live round: `MobileSheetHeader` (sticky, mobile)
 * and the desktop garnet banner (`CharacterSheetHeader`, with the #964 round
 * badge). So this strip carries ONLY the session-specific controls — Note /
 * Leave / End — with no duplicated identity and no "back to sheet" link (there's
 * no separate `/session` page to return from anymore, #962/#976).
 *
 * Desktop shows the inline button cluster; mobile collapses to a slim overflow
 * menu (space is precious mid-turn). Pure CSS `md:` toggle — no breakpoint hook.
 */

import OverflowMenu from "@/components/ui/OverflowMenu";
import SessionHeaderControls from "@/features/session/SessionHeaderControls";

interface SessionHeaderRegionProps {
  leavePending: boolean;
  endPending: boolean;
  leaveError: string | null;
  onCapture: () => void;
  onLeave: () => void;
  onEndClick: () => void;
}

export default function SessionHeaderRegion({
  leavePending,
  endPending,
  leaveError,
  onCapture,
  onLeave,
  onEndClick,
}: SessionHeaderRegionProps) {
  const controlsBusy = endPending || leavePending;
  return (
    <div className="border-b border-parchment-200 bg-parchment-50">
      {/* Desktop: inline Note / Leave / End, right-aligned. */}
      <div className="mx-auto hidden max-w-6xl justify-end px-6 py-3 md:flex">
        <SessionHeaderControls
          controlsBusy={controlsBusy}
          leaveError={leaveError}
          onCapture={onCapture}
          onLeave={onLeave}
          onEndClick={onEndClick}
        />
      </div>

      {/* Mobile: a slim right-aligned overflow menu — identity is in the sticky
          MobileSheetHeader above, the round in the turn tracker below. */}
      <div className="flex items-center justify-end gap-2 px-4 py-2 md:hidden">
        {leaveError && <p className="min-w-0 flex-1 text-xs text-garnet-700">{leaveError}</p>}
        <OverflowMenu
          label="Session actions"
          className="shrink-0"
          items={[
            { label: "＋ Note", onSelect: onCapture },
            { label: "Leave Session", onSelect: onLeave, disabled: controlsBusy },
            {
              label: "End Session",
              onSelect: onEndClick,
              danger: true,
              separatorBefore: true,
              disabled: controlsBusy,
            },
          ]}
        />
      </div>
    </div>
  );
}
