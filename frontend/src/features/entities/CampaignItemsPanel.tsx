import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { GiKnapsack, Plus } from "@/components/ui/icons";
import CampaignItemForm from "@/features/entities/CampaignItemForm";
import CampaignItemRow from "@/features/entities/CampaignItemRow";
import { useCampaignItemsPanelController } from "@/features/entities/useCampaignItemsPanelController";
import type { RulesEdition } from "@character-sheet/shared-types";

interface CampaignItemsPanelProps {
  campaignId: string;
  /** Member characters, so the DM can pick an award target. */
  characters: { id: string; name: string; ownerId: string }[];
  /** The campaign's edition, used only to pick a /reference cache slot (#1437). */
  edition: RulesEdition;
}

// Owner-only Manage-tab panel (#380): authors DM campaign items via two paths —
// clone-from-SRD-catalog (pre-fills the form from a chosen Item) and from-scratch
// with category-conditional detail fields. The shared form is recomposed (#542)
// into labelled fieldsets with progressive disclosure. Each create auto-registers
// a HIDDEN ITEM entity; reveal/edit/delete here keep the shared Codex cache in sync.
// All state, queries (#1299) and mutations live in useCampaignItemsPanelController
// — this component is a template over what it returns.
export default function CampaignItemsPanel({ campaignId, characters, edition }: CampaignItemsPanelProps) {
  const {
    items,
    catalog,
    rarities,
    creating,
    editingId,
    form,
    setForm,
    busyId,
    displayError,
    awardTarget,
    setAwardTarget,
    startCreate,
    startEdit,
    cancelForm,
    handleSubmit,
    toggleReveal,
    handleDelete,
    handleAward,
    handleRevoke,
  } = useCampaignItemsPanelController(campaignId, edition);

  return (
    <Card
      title="Campaign items"
      headingLevel={2}
      titleAccessory={
        <button
          type="button"
          aria-expanded={creating}
          onClick={startCreate}
          className="inline-flex items-center gap-1 text-xs font-semibold text-garnet-700 hover:underline"
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          New item
        </button>
      }
      className="p-4"
    >
      <div className="flex flex-col gap-3 p-4">
        {displayError && (
          <p className="rounded-control bg-garnet-50 px-3 py-2 text-sm font-semibold text-garnet-700">
            {displayError}
          </p>
        )}

        {(creating || editingId !== null) && (
          <CampaignItemForm
            form={form}
            setForm={setForm}
            editingId={editingId}
            catalog={catalog}
            busyId={busyId}
            rarities={rarities}
            onSubmit={handleSubmit}
            onCancel={cancelForm}
          />
        )}

        {items.length === 0 ? (
          <EmptyState
            icon={<GiKnapsack />}
            title="No campaign items yet"
            description="Author magic items and loot here. Each starts hidden — reveal it to drop it into your players' Codex."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-parchment-200">
            {items.map((item) => (
              <CampaignItemRow
                key={item.id}
                item={item}
                campaignId={campaignId}
                characters={characters}
                busyId={busyId}
                rarities={rarities}
                awardTargetValue={awardTarget[item.id] ?? ""}
                onToggleReveal={toggleReveal}
                onEdit={startEdit}
                onDelete={handleDelete}
                onAward={handleAward}
                onRevoke={handleRevoke}
                onAwardTargetChange={(itemId, characterId) =>
                  setAwardTarget((prev) => ({ ...prev, [itemId]: characterId }))
                }
              />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
