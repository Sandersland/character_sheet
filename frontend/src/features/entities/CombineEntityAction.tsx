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
  duplicateItem: CampaignItem | null;
  busy: boolean;
  onCombined: (survivorId: string, message: string) => void;
}

// One Modal instance stays mounted across both steps (title/body swap on
// `survivor`) so focus isn't reset mid-flow. The mutation is owned here, not
// in CombineConfirmDialog, so `close` can gate all three of Modal's
// unconditional dismiss paths (Close link, overlay click, Escape via
// useDialogChrome) while pending. campaignId comes off `duplicate.campaignId`
// rather than a separate prop, so no truthiness guard upstream can silently
// hide the action.
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
