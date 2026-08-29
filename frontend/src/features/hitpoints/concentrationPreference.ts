import { useCallback, useEffect, useState } from "react";

import { usePreferencesSync } from "@/hooks/usePreferencesSync";

const STORAGE_KEY = "cs:pref:autoRollConcentration";

export function loadAutoRollConcentration(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function saveAutoRollConcentration(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
  } catch {
    // Storage full or private-browsing restriction — silently skip.
  }
}

export function useAutoRollConcentrationPref(): [boolean, (value: boolean) => void] {
  const { synced, setPreference } = usePreferencesSync();
  const [value, setValue] = useState<boolean>(loadAutoRollConcentration);

  useEffect(() => {
    if (synced === undefined) return;
    setValue(synced.autoRollConcentration);
  }, [synced]);

  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      saveAutoRollConcentration(next);
      setPreference("autoRollConcentration", next);
    },
    [setPreference],
  );
  return [value, set];
}
