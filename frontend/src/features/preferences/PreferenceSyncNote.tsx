import { useEffect, useState } from "react";

import { usePreferenceSync, type PreferenceKey } from "@/hooks/usePreferencesSync";

// Below this, a write's own round-trip is normal and an indicator would just
// flash in and out — layout thrash for a signal nobody needed to see. Above
// it, the write is worth calling out as still in flight.
const SAVING_HINT_DELAY_MS = 500;

interface PreferenceSyncNoteProps {
  preferenceKey: PreferenceKey;
  className?: string;
}

/**
 * Shared sync indicator for one preference key (#1365), rendered by both the
 * Preferences sheet and the AccountMenu quick controls so the two surfaces
 * can't drift — an error always wins over an in-flight "Saving…", and both
 * are silent otherwise. Visual treatment matches CampaignPreferencesFields'
 * error line, plus `role="alert"`, which that component lacks.
 */
export default function PreferenceSyncNote({ preferenceKey, className = "" }: PreferenceSyncNoteProps) {
  const { saving, error } = usePreferenceSync(preferenceKey);
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
    return <p role="alert" className={`mt-1 text-xs text-garnet-700 ${className}`}>{error}</p>;
  }
  if (showSavingHint) {
    return <p role="status" className={`mt-1 text-xs text-parchment-600 ${className}`}>Saving…</p>;
  }
  return null;
}
