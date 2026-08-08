// Loads the caller's own campaigns (#1801, epic #1795 6/6) — shared by
// ShareSpellSheet (who can I share into?) and ForkSpellSheet (which of these
// do I DM?), each of which otherwise duplicated the identical fetch-on-mount
// effect. No filtering here: `fetchCampaigns()` already scopes to the
// caller's own memberships server-side; a consumer narrows further (e.g. to
// `role === "OWNER"`) itself.
import { useEffect, useState } from "react";

import { fetchCampaigns } from "@/api/client";
import type { Campaign } from "@/types/character";

export function useCallerCampaigns(): { campaigns: Campaign[] | null; error: string | null } {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchCampaigns()
      .then((list) => { if (mounted) setCampaigns(list); })
      .catch(() => { if (mounted) setError("Couldn't load your campaigns."); });
    return () => { mounted = false; };
  }, []);

  return { campaigns, error };
}
