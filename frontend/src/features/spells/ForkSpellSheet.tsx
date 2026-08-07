// Fork a catalog spell into an overriding copy (#1800/#1801, epic #1795
// 5/6+6/6): "Make my version" (any viewer, USER scope) always offered;
// "Override for campaign" (that campaign's DM only) delegated to
// CampaignOverrideSection, which owns the per-campaign list/loading
// branching so this component's own complexity stays small. Calls POST
// …/fork via api/client — never fetch() directly.
//
// Unlike a grant, a fork is NOT idempotent — every successful POST creates a
// brand-new CatalogEntry (forkContent's own deep copy, #1800's file banner).
// "Make my version" is therefore a one-shot WITHIN THIS SHEET INSTANCE: once
// it succeeds it flips to a disabled "done" state instead of staying
// clickable, so this open sheet can't be clicked twice for a second,
// throwaway fork. That's a courtesy, not a guarantee — onForked's refetch
// unmounts this sheet and re-renders the row, so re-opening Fork on the same
// (now-shadowed) origin and forking again is still possible, and would mint
// a second USER entry. Deduping a lineage down to one visible winner either
// way is the backend resolver's job (pickLineageWinner, lib/catalog/
// entitlement.ts), not something this UI enforces.
import { useState } from "react";

import { forkCatalogEntry } from "@/api/client";
import BottomSheet from "@/components/ui/BottomSheet";
import CampaignOverrideSection from "@/features/spells/CampaignOverrideSection";
import { useCallerCampaigns } from "@/hooks/useCallerCampaigns";
import type { CatalogSpell } from "@/types/character";

interface ForkSpellSheetProps {
  spell: CatalogSpell;
  /** A fork succeeded — caller refetches the catalog so the new entry (and, for
   *  a USER fork, its "My homebrew" badge) shows up without a manual reload. */
  onForked: () => void;
  onClose: () => void;
}

type ActionState = "idle" | "busy" | "done";

const MAKE_MY_VERSION_LABEL: Record<ActionState, string> = {
  idle: "Make my version",
  busy: "Creating…",
  done: "Your version was created ✓",
};

export default function ForkSpellSheet({ spell, onForked, onClose }: ForkSpellSheetProps) {
  const [userForkState, setUserForkState] = useState<ActionState>("idle");
  const [userForkError, setUserForkError] = useState<string | null>(null);
  const { campaigns, error: loadError } = useCallerCampaigns();

  const entryId = spell.catalog?.entryId;

  async function handleMakeMyVersion() {
    if (!entryId) return;
    setUserForkState("busy");
    setUserForkError(null);
    try {
      await forkCatalogEntry(entryId, { scope: "USER" });
      setUserForkState("done");
      onForked();
    } catch (err) {
      setUserForkState("idle");
      setUserForkError(err instanceof Error ? err.message : "Failed to create your version.");
    }
  }

  return (
    <BottomSheet title={`Fork "${spell.name}"`} subtitle="Make your own editable copy" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          {/* `!entryId` mirrors handleMakeMyVersion's own early return — without it
              a spell served with no catalog metadata would show a fully-enabled
              button whose click is silently a no-op. */}
          <button
            type="button"
            disabled={!entryId || userForkState !== "idle"}
            onClick={handleMakeMyVersion}
            className="w-full rounded-control bg-arcane-700 py-2.5 text-center text-sm font-semibold text-parchment-50 hover:bg-arcane-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {MAKE_MY_VERSION_LABEL[userForkState]}
          </button>
          <p className="mt-1 text-xs text-parchment-600">
            Copies this spell into your own homebrew library, editable from the Homebrew tab.
          </p>
          {userForkError && <p className="mt-1 text-xs text-garnet-700">{userForkError}</p>}
        </div>

        <CampaignOverrideSection entryId={entryId} campaigns={campaigns} loadError={loadError} onForked={onForked} />
      </div>
    </BottomSheet>
  );
}
