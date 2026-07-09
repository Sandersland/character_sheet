import { useMemo } from "react";
import { useLocation } from "react-router-dom";

// Return to wherever the user came from: Manage when the origin was the Manage
// tab (carried via location.state.from or ?from=manage), else the Codex (#489).
export function useEntityBackTo(campaignId?: string): string {
  const location = useLocation();
  return useMemo(() => {
    const fromState = (location.state as { from?: string } | null)?.from;
    // Only honor an in-app relative path (defense-in-depth: the value is only
    // ever set by CampaignManagePanel, but never route to a non-"/" target).
    if (typeof fromState === "string" && fromState.startsWith("/")) return fromState;
    if (campaignId && new URLSearchParams(location.search).get("from") === "manage") {
      return `/campaigns/${campaignId}/manage`;
    }
    return campaignId ? `/campaigns/${campaignId}/codex` : "/campaigns";
  }, [location.state, location.search, campaignId]);
}
