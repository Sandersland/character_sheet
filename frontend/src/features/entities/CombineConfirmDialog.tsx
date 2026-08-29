import GoldWarningBox, { DiscardedItemsBox } from "@/components/ui/GoldWarningBox";
import type { useCombineEntity } from "@/features/entities/useCombineEntity";
import {
  combineDiscardedItems,
  combineItemLinkTransferWarning,
  combineMentionSummary,
  combineRedactedMentionWarning,
  preparedMergeDiscardedItem,
} from "@/lib/combinePreview";
import { errorMessage } from "@/lib/errorMessage";
import type { CampaignEntity, CampaignEntityMerge, CampaignItem } from "@/types/character";

interface CombineConfirmDialogProps {
  duplicate: CampaignEntity;
  survivor: CampaignEntity;
  merges: CampaignEntityMerge[];
  // Prefetched via fetchCampaignItemByEntity for the page being combined away —
  // drives the item-link-transfer warning below alongside survivor.itemId.
  duplicateItem: CampaignItem | null;
  // Owned by CombineEntityAction, not created here — it needs the same
  // instance to gate the Modal's dismiss paths while pending, so a user can't
  // make an irreversible combine look cancelled by dismissing mid-flight.
  mutation: ReturnType<typeof useCombineEntity>;
  onCancel: () => void;
  onCombined: (survivorId: string, message: string) => void;
}

// Every number here is derived from data already on the wire — combining
// never fetches anything new just to render this preview. A 409 from the
// endpoint lands in mutation.error and renders inline, never a toast, since
// the whole point is the dialog staying open for the DM to read why.
export default function CombineConfirmDialog({
  duplicate,
  survivor,
  merges,
  duplicateItem,
  mutation,
  onCancel,
  onCombined,
}: CombineConfirmDialogProps) {
  const mergeItem = preparedMergeDiscardedItem([duplicate], merges, "solo");
  const discarded = [
    ...combineDiscardedItems([duplicate], survivor, "solo"),
    ...(mergeItem ? [mergeItem] : []),
  ];
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

      <DiscardedItemsBox heading={`Discarded with ${duplicate.name}`} items={discarded} />

      {redactedMentionWarning && (
        <GoldWarningBox>
          Mentions moving to {survivor.name} will render as redacted "Hidden" chips to players
          until {survivor.name} is revealed.
        </GoldWarningBox>
      )}

      {itemLinkWarning && (
        <GoldWarningBox>
          {survivor.name} becomes {duplicate.name}'s campaign item entry — deleting that item will
          delete {survivor.name} too.
        </GoldWarningBox>
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
