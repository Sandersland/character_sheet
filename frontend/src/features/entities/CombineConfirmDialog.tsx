import type { ReactNode } from "react";

import { TriangleAlert } from "@/components/ui/icons";
import { useCombineEntity } from "@/features/entities/useCombineEntity";
import {
  combineDiscardedItems,
  combineItemLinkTransferWarning,
  combineMentionSummary,
  combineRedactedMentionWarning,
  duplicateHasPreparedMerge,
} from "@/lib/combinePreview";
import { errorMessage } from "@/lib/errorMessage";
import type { CampaignEntity, CampaignEntityMerge, CampaignItem } from "@/types/character";

interface CombineConfirmDialogProps {
  campaignId: string;
  duplicate: CampaignEntity;
  survivor: CampaignEntity;
  merges: CampaignEntityMerge[];
  // The duplicate's own fronted campaign item, if any (already on the wire
  // for the page being combined away, via fetchCampaignItemByEntity) — drives
  // the item-link-transfer warning below alongside survivor.itemId.
  duplicateItem: CampaignItem | null;
  onCancel: () => void;
  onCombined: (survivorId: string, message: string) => void;
}

// One gold "heads up" row, shared by every warning in this dialog (lost
// content, redacted mentions, an inherited item link) so they read as one
// visual language.
function GoldWarning({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-card border border-gold-400 bg-gold-100 px-3 py-2.5 text-xs font-medium text-gold-900">
      <TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

// The consequence-preview body of the "Combine into…" dialog (#1943). Every
// number here is derived from data already on the wire (entity.stats,
// aliases/notes/portrait/type/visibility) — combining never fetches anything
// new just to render this preview. A 409 from the endpoint (both-linked,
// ITEM-link-to-non-ITEM, EXECUTED-revealed duplicate) lands in mutation.error
// and renders inline here, same treatment as any other failure — never a toast,
// since the whole point is the dialog staying open for the DM to read why.
export default function CombineConfirmDialog({
  campaignId,
  duplicate,
  survivor,
  merges,
  duplicateItem,
  onCancel,
  onCombined,
}: CombineConfirmDialogProps) {
  const mutation = useCombineEntity(campaignId);
  const discarded = combineDiscardedItems(duplicate, survivor);
  const preparedMergeWarning = duplicateHasPreparedMerge(merges, duplicate.id);
  const redactedMentionWarning = combineRedactedMentionWarning(duplicate, survivor);
  const itemLinkWarning = combineItemLinkTransferWarning(duplicate.type, survivor, duplicateItem !== null);

  function handleConfirm() {
    mutation.mutate(
      { duplicateId: duplicate.id, survivorId: survivor.id },
      {
        onSuccess: () => onCombined(survivor.id, `${duplicate.name} combined into ${survivor.name}.`),
      },
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-parchment-700">
        <span className="font-semibold text-parchment-900">{duplicate.name}</span> will be combined
        into <span className="font-semibold text-parchment-900">{survivor.name}</span> — use this
        when an entry was created by mistake. For a character secretly revealed to be another,
        prepare an identity merge instead.
      </p>

      <ul className="flex flex-col gap-1.5 text-sm text-parchment-700">
        <li>{combineMentionSummary(duplicate, survivor.name)}</li>
        <li>{duplicate.name} is deleted from the codex</li>
      </ul>

      {discarded.length > 0 && (
        <GoldWarning>
          <div className="font-bold">Discarded with {duplicate.name}</div>
          <ul className="flex flex-col gap-1">
            {discarded.map((item) => (
              <li key={item.key}>{item.label}</li>
            ))}
          </ul>
        </GoldWarning>
      )}

      {redactedMentionWarning && (
        <GoldWarning>
          Mentions moving to {survivor.name} will render as redacted "Hidden" chips to players
          until {survivor.name} is revealed.
        </GoldWarning>
      )}

      {itemLinkWarning && (
        <GoldWarning>
          {survivor.name} becomes {duplicate.name}'s campaign item entry — deleting that item will
          delete {survivor.name} too.
        </GoldWarning>
      )}

      {preparedMergeWarning && (
        <p className="text-xs font-semibold text-garnet-700">
          {duplicate.name} has a prepared identity merge — combining drops it.
        </p>
      )}

      {mutation.isError && (
        <p className="text-xs font-semibold text-garnet-700">
          {errorMessage(mutation.error, "Failed to combine entities.")}
        </p>
      )}

      <p className="text-xs font-semibold text-garnet-700">This cannot be undone.</p>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={mutation.isPending}
          className="rounded-control bg-garnet-surface px-4 py-2 text-sm font-semibold text-garnet-on-surface transition-colors hover:bg-garnet-surface-hover disabled:opacity-50"
        >
          {mutation.isPending ? "Combining…" : `Combine and delete ${duplicate.name}`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={mutation.isPending}
          className="text-sm font-semibold text-garnet-700 hover:underline disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
