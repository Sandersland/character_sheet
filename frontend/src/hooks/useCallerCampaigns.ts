import { useEffect, useState } from "react";

import { fetchCampaigns } from "@/api/client";
import type { Campaign } from "@/types/character";

export function useCallerCampaigns(): { campaigns: Campaign[] | null; error: string | null } {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    // fetchCampaigns() already scopes to the caller's own memberships
    // server-side; a consumer narrows further (e.g. to role === "OWNER")
    // itself.
    fetchCampaigns()
      .then((list) => { if (mounted) setCampaigns(list); })
      .catch(() => { if (mounted) setError("Couldn't load your campaigns."); });
    return () => { mounted = false; };
  }, []);

  return { campaigns, error };
}
