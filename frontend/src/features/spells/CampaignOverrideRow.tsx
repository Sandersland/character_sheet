// One "Override for a campaign you run" row (#1801, epic #1795 6/6),
// extracted out of ForkSpellSheet: each row owns its own busy/done/error
// state so the parent sheet doesn't need a Record-keyed state map + inline
// per-row handler closures for what's otherwise a one-shot POST per
// campaign (a fork is NOT idempotent — ForkSpellSheet's own file banner).
import { useState } from "react";

import { forkCatalogEntry } from "@/api/client";
import type { Campaign } from "@/types/character";

type OverrideState = "idle" | "busy" | "done";

interface CampaignOverrideRowProps {
  campaign: Campaign;
  entryId: string;
  onForked: () => void;
}

export default function CampaignOverrideRow({ campaign, entryId, onForked }: CampaignOverrideRowProps) {
  const [state, setState] = useState<OverrideState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleOverride() {
    setState("busy");
    setError(null);
    try {
      await forkCatalogEntry(entryId, { scope: "CAMPAIGN", campaignId: campaign.id });
      setState("done");
      onForked();
    } catch (err) {
      setState("idle");
      setError(err instanceof Error ? err.message : "Failed to override for this campaign.");
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-control border border-parchment-200 bg-parchment-50 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-parchment-900">{campaign.name}</p>
        {error && <p className="text-xs text-garnet-700">{error}</p>}
      </div>
      <button
        type="button"
        disabled={state !== "idle"}
        onClick={handleOverride}
        aria-label={`Override for ${campaign.name}`}
        className="shrink-0 rounded-full border border-garnet-700 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-garnet-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {state === "done" ? "Overridden ✓" : state === "busy" ? "Overriding…" : "Override"}
      </button>
    </li>
  );
}
