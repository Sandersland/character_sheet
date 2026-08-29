import { useEffect, useState } from "react";

import { usePreferenceSync, type PreferenceKey } from "@/hooks/usePreferencesSync";

// Below this, a write's own round-trip would just flash the indicator in and out with nothing worth seeing.
const SAVING_HINT_DELAY_MS = 500;

interface PreferenceSyncNoteProps {
  preferenceKey: PreferenceKey;
  className?: string;
  // AccountMenu's DropdownMenu role="menu" panel only permits {group, menuitem, menuitemradio, menuitemcheckbox} children, so role="alert"/"status" there fails aria-required-children (confirmed via axe) — announce=false keeps that copy visually identical but silent to assistive tech.
  announce?: boolean;
}

// Visual treatment matches CampaignPreferencesFields' error line, plus role="alert", which that component lacks.
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
