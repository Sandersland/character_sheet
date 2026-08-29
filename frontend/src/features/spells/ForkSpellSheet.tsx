// A fork is not idempotent; a lineage is deduped to one winner by the backend's
// pickLineageWinner, not by this UI.
import { useState } from "react";

import { forkCatalogEntry } from "@/api/client";
import BottomSheet from "@/components/ui/BottomSheet";
import CampaignOverrideSection from "@/features/spells/CampaignOverrideSection";
import { useCallerCampaigns } from "@/hooks/useCallerCampaigns";
import type { CatalogSpell } from "@/types/character";

interface ForkSpellSheetProps {
  spell: CatalogSpell;
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
          {/* disabled mirrors handleMakeMyVersion's early return, so a spell with no catalog metadata can't show an enabled no-op button. */}
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
