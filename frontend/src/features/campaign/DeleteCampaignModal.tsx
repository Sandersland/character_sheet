import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { deleteCampaign } from "@/api/client";
import { getQueryClient } from "@/api/queryClient";
import { campaignKeys, characterKeys, sessionKeys } from "@/api/queryKeys";
import Modal from "@/components/ui/Modal";

interface DeleteCampaignModalProps {
  campaignId: string;
  campaignName: string;
  onClose: () => void;
}

/**
 * Confirmation dialog before permanently deleting a campaign (owner-only; the
 * server 409s while a session is active, surfaced verbatim below). On success
 * every campaign-scoped cache entry is removed and character queries are
 * invalidated — members' characters just had campaignId nulled server-side —
 * then navigation replaces history so Back can't reach the dead campaign URL.
 */
export default function DeleteCampaignModal({
  campaignId,
  campaignName,
  onClose,
}: DeleteCampaignModalProps) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      await deleteCampaign(campaignId);
      const queryClient = getQueryClient();
      queryClient.removeQueries({ queryKey: campaignKeys.scope(campaignId) });
      queryClient.removeQueries({ queryKey: sessionKeys.campaignList(campaignId) });
      await queryClient.invalidateQueries({ queryKey: characterKeys.all });
      navigate("/campaigns", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete campaign.");
      setPending(false);
    }
  }

  return (
    <Modal title="Delete campaign?" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <p className="text-sm text-parchment-700">
          Permanently delete{" "}
          <span className="font-semibold text-parchment-900">{campaignName}</span>?{" "}
          <span className="font-semibold text-garnet-700">This can't be undone.</span>
        </p>
        <p className="text-sm text-parchment-700">
          Its sessions, codex, campaign items, and homebrew are deleted. Characters are
          kept — they simply leave the campaign, along with their journals.
        </p>

        {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            className="rounded-control bg-garnet-surface px-4 py-2 text-sm font-semibold text-garnet-on-surface transition-colors hover:bg-garnet-surface-hover disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete campaign"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-sm font-semibold text-garnet-700 hover:underline disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
