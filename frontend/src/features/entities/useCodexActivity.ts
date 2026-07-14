import { useEffect, useState } from "react";

import { fetchEntities, fetchEntityActivity } from "@/api/client";
import type { CampaignEntity, CodexActivityItem } from "@/types/character";

// Data for the activity rail (#841). Deliberately does NOT prime the shared
// useCampaignEntities cache: its plain-list primes would clobber our stats.
export function useCodexActivity(campaignId: string) {
  const [statsEntities, setStatsEntities] = useState<CampaignEntity[]>([]);
  const [activity, setActivity] = useState<CodexActivityItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    Promise.all([
      fetchEntities(campaignId, { includeStats: true }).catch(() => []),
      fetchEntityActivity(campaignId, { limit: 8 }).catch(() => []),
    ]).then(([entities, items]) => {
      if (!active) return;
      setStatsEntities(entities);
      setActivity(items);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [campaignId]);

  return { statsEntities, activity, loaded };
}
