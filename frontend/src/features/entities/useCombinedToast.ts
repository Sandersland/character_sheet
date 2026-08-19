import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// A one-shot success toast carried across the navigation "Combine into…" makes
// after deleting the duplicate (#1943): the duplicate's own page is gone, so
// there's nowhere to show a toast except the survivor's page it lands on.
// location.state is the only channel that survives that jump — read it once
// and clear it so a later back/forward through history doesn't replay it.
// Clearing preserves every OTHER state key (e.g. useEntityBackTo's `from`) —
// only `combinedToast` itself is dropped, so the combine doesn't degrade the
// page's own back-link.
export function useCombinedToast(): string | null {
  const location = useLocation();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const state = location.state as Record<string, unknown> | null;
    const carried = state?.combinedToast;
    if (typeof carried !== "string") return;
    setMessage(carried);
    const rest = { ...state };
    delete rest.combinedToast;
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: Object.keys(rest).length > 0 ? rest : null,
    });
  }, [location.state, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  return message;
}
