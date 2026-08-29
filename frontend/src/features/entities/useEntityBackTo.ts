import { useMemo } from "react";
import { useLocation } from "react-router-dom";

export function useEntityBackTo(campaignId?: string): string {
  const location = useLocation();
  return useMemo(() => {
    const fromState = (location.state as { from?: string } | null)?.from;
    // Defense-in-depth: fromState is only ever set by CampaignManagePanel, but never route to a non-"/" target.
    if (typeof fromState === "string" && fromState.startsWith("/")) return fromState;
    if (campaignId && new URLSearchParams(location.search).get("from") === "manage") {
      return `/campaigns/${campaignId}/manage`;
    }
    return campaignId ? `/campaigns/${campaignId}/codex` : "/campaigns";
  }, [location.state, location.search, campaignId]);
}
