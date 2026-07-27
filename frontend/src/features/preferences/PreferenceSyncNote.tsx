import { useEffect, useState } from "react";

import { usePreferenceSync, type PreferenceKey } from "@/hooks/usePreferencesSync";

// Below this, a write's own round-trip is normal and an indicator would just
// flash in and out — layout thrash for a signal nobody needed to see. Above
// it, the write is worth calling out as still in flight.
const SAVING_HINT_DELAY_MS = 500;

interface PreferenceSyncNoteProps {
  preferenceKey: PreferenceKey;
  className?: string;
  // AccountMenu's quick controls live inside DropdownMenu's role="menu" panel
  // (#1365), whose ARIA-required-owned-elements list is {group, menuitem,
  // menuitemradio, menuitemcheckbox} — role="alert"/"status" anywhere in that
  // subtree fails aria-required-children (confirmed via axe, not assumed).
  // The Preferences sheet has no such constraint, so it keeps the live role;
  // the menu's copy stays visually identical but silent to assistive tech —
  // the full accessible (role="alert") experience is one click away via the
  // sheet's own "Preferences…" entry, which every quick control links to.
  announce?: boolean;
}

/**
 * Shared sync indicator for one preference key (#1365), rendered by both the
 * Preferences sheet and the AccountMenu quick controls so the two surfaces
 * can't drift — an error always wins over an in-flight "Saving…", and both
 * are silent otherwise. Visual treatment matches CampaignPreferencesFields'
 * error line, plus `role="alert"`, which that component lacks.
 */
export default function PreferenceSyncNote({
  preferenceKey,
  className = "",
  announce = true,
}: PreferenceSyncNoteProps) {
  const { saving, error, retry } = usePreferenceSync(preferenceKey);
  const [showSavingHint, setShowSavingHint] = useState(false);

  useEffect(() => {
    if (!saving) {
      setShowSavingHint(false);
      return;
    }
    const timer = setTimeout(() => setShowSavingHint(true), SAVING_HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [saving]);

  if (error) {
    return (
      <p role={announce ? "alert" : undefined} className={`mt-1 text-xs text-garnet-700 ${className}`}>
        {error}
        {/* Retry stays sheet-only (announce=true): AccountMenu's role="menu"
            panel can't own an interactive descendant outside its required
            {group, menuitem*} set (the same aria-required-children constraint
            documented on `announce` above) — its quick controls already
            settle for visual-only, so a click-to-retry there would need a
            different affordance than "a button inside this note". */}
        {announce && retry && (
          <button type="button" onClick={retry} className="ml-1 underline">
            Retry
          </button>
        )}
      </p>
    );
  }
  if (showSavingHint) {
    return (
      <p role={announce ? "status" : undefined} className={`mt-1 text-xs text-parchment-600 ${className}`}>
        Saving…
      </p>
    );
  }
  return null;
}
