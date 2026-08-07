// Share/unshare a homebrew spell into a campaign (#1799/#1801, epic #1795
// 4/6+6/6): opened from HomebrewSpellManageRow's "Share" action on the
// caller's own USER-scope catalog entries. Calls the grant endpoints via
// api/client — never fetch() directly (CLAUDE.md).
//
// There is no GET …/grants list endpoint (grants.ts only exposes POST/
// DELETE), so this sheet has no way to learn which campaigns the entry is
// ALREADY shared into before the caller acts here. Both calls are idempotent
// server-side (a repeat POST 200s instead of erroring, DELETE 204s even if
// the grant is already gone — see grants.ts's own comment), so every row
// starts in the neutral "Share" state and flips to "Shared ✓ / Unshare"
// only once THIS sheet has confirmed a grant this session — never claiming
// to know a prior session's state it can't see.
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

// Four states, not three: "busy" alone can't tell a claude-review finding's
// exact bug — an in-flight unshare needs its OWN busy state ("unsharing"),
// distinct from an in-flight share ("sharing"), so the button on the
// "already shared" side reads "Unsharing…" instead of falling through to
// the share-side button's "Sharing…"/"Share" label.
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
