import { useState } from "react";
import { Link } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { addCharacterToCampaign } from "@/api/client";
import type { Character } from "@/types/character";

interface CampaignIndicatorProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

// Sheet-header campaign affordance: a badge when the character is already in a
// campaign, otherwise an "Add to campaign" action that attaches it by id.
export default function CampaignIndicator({ character, onUpdate }: CampaignIndicatorProps) {
  const [open, setOpen] = useState(false);
  const [campaignId, setCampaignId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (character.campaignId) {
    return (
      <Link to="/campaigns" className="inline-flex">
        <Badge tone="arcane">In a campaign</Badge>
      </Link>
    );
  }

  async function handleAdd() {
    if (!campaignId.trim()) return;
    setPending(true);
    setError(null);
    try {
      onUpdate(await addCharacterToCampaign(character.id, campaignId.trim()));
      setOpen(false);
      setCampaignId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add to campaign");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-arcane-700 hover:underline"
      >
        Add to campaign
      </button>
      {open && (
        <Modal title="Add to campaign" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-parchment-600">
              Paste the campaign id (from the Campaigns page) to add {character.name} to a shared
              campaign.
            </p>
            {error && (
              <p className="rounded-control bg-garnet-50 px-3 py-2 text-sm font-semibold text-garnet-700">
                {error}
              </p>
            )}
            <label className="block text-xs font-semibold text-parchment-700" htmlFor="add-campaign-id">
              Campaign id
            </label>
            <input
              id="add-campaign-id"
              type="text"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-control px-3 py-1.5 text-xs font-semibold text-parchment-600 hover:text-parchment-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={pending || !campaignId.trim()}
                className="rounded-control bg-garnet-700 px-3 py-1.5 text-xs font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
