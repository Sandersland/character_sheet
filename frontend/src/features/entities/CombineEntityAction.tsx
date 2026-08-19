import { useState } from "react";

import { Combine } from "@/components/ui/icons";
import Modal from "@/components/ui/Modal";
import CombineConfirmDialog from "@/features/entities/CombineConfirmDialog";
import CombineSurvivorPicker from "@/features/entities/CombineSurvivorPicker";
import { useCampaignEntities } from "@/hooks/useCampaignEntities";
import { useCampaignMerges } from "@/hooks/useCampaignMerges";
import type { CampaignEntity, CampaignItem } from "@/types/character";

interface CombineEntityActionProps {
  campaignId: string;
  duplicate: CampaignEntity;
  // The duplicate's own fronted campaign item, if any — see
  // CombineConfirmDialog's duplicateItem prop for why this rides down from
  // the entity-detail page's own read rather than a fresh fetch here.
  duplicateItem: CampaignItem | null;
  busy: boolean;
  onCombined: (survivorId: string, message: string) => void;
}

// Owner-only typo-dedup entry point (#1943), the entity-detail sibling of
// CampaignManagePanel's identity-merge workflow: this is "this one's a
// mistake" (destroys the duplicate outright), that is "this one's a secret"
// (records a reveal, keeps both rows) — deliberately its own icon/copy/surface
// rather than living next to Hide/Delete unlabeled. Two steps share one Modal
// instance — pick a survivor, then confirm — so Cancel from either step always
// lands back on the trigger, not a half-open dialog.
export default function CombineEntityAction({
  campaignId,
  duplicate,
  duplicateItem,
  busy,
  onCombined,
}: CombineEntityActionProps) {
  const { entities } = useCampaignEntities(campaignId);
  const { merges } = useCampaignMerges(campaignId);
  const [survivor, setSurvivor] = useState<CampaignEntity | null>(null);
  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
    setSurvivor(null);
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
      >
        <Combine aria-hidden="true" className="h-3 w-3" />
        Combine into…
      </button>

      {open && !survivor && (
        <Modal title="Combine into…" onClose={close}>
          <CombineSurvivorPicker duplicateId={duplicate.id} entities={entities} onPick={setSurvivor} />
        </Modal>
      )}

      {open && survivor && (
        <Modal title={`Combine into ${survivor.name}`} onClose={close}>
          <CombineConfirmDialog
            campaignId={campaignId}
            duplicate={duplicate}
            survivor={survivor}
            merges={merges}
            duplicateItem={duplicateItem}
            onCancel={close}
            onCombined={(survivorId, message) => {
              close();
              onCombined(survivorId, message);
            }}
          />
        </Modal>
      )}
    </>
  );
}
