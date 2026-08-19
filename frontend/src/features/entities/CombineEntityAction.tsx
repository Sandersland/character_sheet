import { useState } from "react";

import { Combine } from "@/components/ui/icons";
import Modal from "@/components/ui/Modal";
import CombineConfirmDialog from "@/features/entities/CombineConfirmDialog";
import CombineSurvivorPicker from "@/features/entities/CombineSurvivorPicker";
import { useCombineEntity } from "@/features/entities/useCombineEntity";
import { useCampaignEntities } from "@/hooks/useCampaignEntities";
import { useCampaignMerges } from "@/hooks/useCampaignMerges";
import type { CampaignEntity, CampaignItem } from "@/types/character";

interface CombineEntityActionProps {
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
// rather than living next to Hide/Delete unlabeled. ONE Modal instance stays
// mounted across both steps — the title and body swap on `survivor`, the
// element itself never unmounts — so focus and any mount animation aren't
// reset mid-flow, and Cancel from either step always lands back on the
// trigger, not a half-open dialog. The mutation is owned HERE (not inside
// CombineConfirmDialog) so `close` can consult `mutation.isPending` and
// refuse to dismiss — Modal's onClose fires unconditionally on its Close
// link, an overlay click, AND Escape (useDialogChrome), so gating only the
// dialog's own Cancel button would leave those three paths free to make an
// in-flight, irreversible combine look cancelled. campaignId comes off
// `duplicate.campaignId` (a required wire field) rather than a separate prop,
// so there is no truthiness guard upstream that could silently hide the action.
export default function CombineEntityAction({
  duplicate,
  duplicateItem,
  busy,
  onCombined,
}: CombineEntityActionProps) {
  const campaignId = duplicate.campaignId;
  const { entities } = useCampaignEntities(campaignId);
  const { merges } = useCampaignMerges(campaignId);
  const mutation = useCombineEntity(campaignId);
  const [survivor, setSurvivor] = useState<CampaignEntity | null>(null);
  const [open, setOpen] = useState(false);

  function close() {
    if (mutation.isPending) return;
    setOpen(false);
    setSurvivor(null);
    mutation.reset();
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

      {open && (
        <Modal title={survivor ? `Combine into ${survivor.name}` : "Combine into…"} onClose={close}>
          {!survivor ? (
            <CombineSurvivorPicker duplicateId={duplicate.id} entities={entities} onPick={setSurvivor} />
          ) : (
            <CombineConfirmDialog
              duplicate={duplicate}
              survivor={survivor}
              merges={merges}
              duplicateItem={duplicateItem}
              mutation={mutation}
              onCancel={close}
              onCombined={(survivorId, message) => {
                close();
                onCombined(survivorId, message);
              }}
            />
          )}
        </Modal>
      )}
    </>
  );
}
