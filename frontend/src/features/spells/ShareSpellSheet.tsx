// There is no GET …/grants list endpoint, so every row starts "Share" and only flips to "Shared / Unshare" once this sheet confirms a grant this session.
import { useState } from "react";

import { shareCatalogEntry, unshareCatalogEntry } from "@/api/client";
import BottomSheet from "@/components/ui/BottomSheet";
import Spinner from "@/components/ui/Spinner";
import { useCallerCampaigns } from "@/hooks/useCallerCampaigns";
import type { CatalogSpell } from "@/types/character";

interface ShareSpellSheetProps {
  spell: CatalogSpell;
  onClose: () => void;
}

type RowState = "idle" | "sharing" | "shared" | "unsharing";

export default function ShareSpellSheet({ spell, onClose }: ShareSpellSheetProps) {
  const { campaigns, error: loadError } = useCallerCampaigns();
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const entryId = spell.catalog?.entryId;

  async function handleShare(campaignId: string) {
    if (!entryId) return;
    setRowState((s) => ({ ...s, [campaignId]: "sharing" }));
    setRowError((s) => ({ ...s, [campaignId]: "" }));
    try {
      await shareCatalogEntry(entryId, campaignId);
      setRowState((s) => ({ ...s, [campaignId]: "shared" }));
    } catch (err) {
      setRowState((s) => ({ ...s, [campaignId]: "idle" }));
      setRowError((s) => ({ ...s, [campaignId]: err instanceof Error ? err.message : "Failed to share." }));
    }
  }

  async function handleUnshare(campaignId: string) {
    if (!entryId) return;
    setRowState((s) => ({ ...s, [campaignId]: "unsharing" }));
    setRowError((s) => ({ ...s, [campaignId]: "" }));
    try {
      await unshareCatalogEntry(entryId, campaignId);
      setRowState((s) => ({ ...s, [campaignId]: "idle" }));
    } catch (err) {
      setRowState((s) => ({ ...s, [campaignId]: "shared" }));
      setRowError((s) => ({ ...s, [campaignId]: err instanceof Error ? err.message : "Failed to unshare." }));
    }
  }

  return (
    <BottomSheet title={`Share "${spell.name}"`} subtitle="Visible to every member of a shared campaign" onClose={onClose}>
      {loadError && <p className="text-xs text-garnet-700">{loadError}</p>}
      {campaigns === null && !loadError && <Spinner />}
      {campaigns !== null && campaigns.length === 0 && (
        <p className="py-2 text-center text-xs text-parchment-600">You aren&apos;t a member of any campaigns yet.</p>
      )}
      {campaigns !== null && campaigns.length > 0 && (
        <ul className="flex flex-col gap-2">
          {campaigns.map((campaign) => {
            const state = rowState[campaign.id] ?? "idle";
            const isShared = state === "shared" || state === "unsharing";
            return (
              <li
                key={campaign.id}
                className="flex items-center justify-between gap-3 rounded-control border border-parchment-200 bg-parchment-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-parchment-900">{campaign.name}</p>
                  {rowError[campaign.id] && <p className="text-xs text-garnet-700">{rowError[campaign.id]}</p>}
                </div>
                {isShared ? (
                  <button
                    type="button"
                    disabled={state === "unsharing"}
                    onClick={() => handleUnshare(campaign.id)}
                    aria-label={`Unshare from ${campaign.name}`}
                    className="shrink-0 rounded-full border border-parchment-300 bg-parchment-100 px-3 py-1.5 text-xs font-semibold text-parchment-700 hover:bg-parchment-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {state === "unsharing" ? "Unsharing…" : "Shared ✓ — Unshare"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={state === "sharing"}
                    onClick={() => handleShare(campaign.id)}
                    aria-label={`Share into ${campaign.name}`}
                    className="shrink-0 rounded-full border border-garnet-700 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-garnet-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {state === "sharing" ? "Sharing…" : "Share"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </BottomSheet>
  );
}
