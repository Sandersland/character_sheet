// Loads the chronicle read model for the journal page (#864): the campaign's arcs
// ("parts") and its sessions ("chapters", with derived sessionNumber + this
// character's noteCount). A campaign-less character has neither, so the page falls
// back to a flat between-sessions chronicle. Per-chapter note counts are derived
// from the live character.journal in the page, not from the API's snapshot, so the
// spine stays current as notes are added/removed without a refetch.

import { useCallback, useEffect, useState } from "react";

import { fetchCampaignArcs, fetchChronicleSessions } from "@/api/client";
import type { CampaignArc, Character, ChronicleSession } from "@/types/character";

export function useChronicle(character: Character | null | undefined) {
  const campaignId = character?.campaignId ?? null;
  const characterId = character?.id ?? null;

  const [arcs, setArcs] = useState<CampaignArc[]>([]);
  const [sessions, setSessions] = useState<ChronicleSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!campaignId || !characterId) {
      setArcs([]);
      setSessions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextArcs, nextSessions] = await Promise.all([
        fetchCampaignArcs(campaignId),
        fetchChronicleSessions(campaignId, characterId),
      ]);
      setArcs(nextArcs);
      setSessions(nextSessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the chronicle.");
    } finally {
      setLoading(false);
    }
  }, [campaignId, characterId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { arcs, sessions, loading, error, setSessions, reload };
}
