import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// location.state is the only channel that survives the post-combine navigation; only combinedToast is cleared from it so other keys (e.g. useEntityBackTo's `from`) survive a later back/forward replay.
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
