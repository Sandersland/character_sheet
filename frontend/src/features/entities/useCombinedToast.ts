import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// A one-shot success toast carried across the navigation "Combine into…" makes
// after deleting the duplicate (#1943): the duplicate's own page is gone, so
// there's nowhere to show a toast except the survivor's page it lands on.
// location.state is the only channel that survives that jump — read it once
// and clear it (replace, empty state) so a later back/forward through history
// doesn't replay it.
export function useCombinedToast(): string | null {
  const location = useLocation();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const carried = (location.state as { combinedToast?: string } | null)?.combinedToast;
    if (!carried) return;
    setMessage(carried);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
  }, [location.state, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  return message;
}
