import { Link, useParams } from "react-router-dom";

import Spinner from "@/components/ui/Spinner";
import CampaignItemCard from "@/features/entities/CampaignItemCard";
import EntityDetailHeader from "@/features/entities/EntityDetailHeader";
import EntityDetailsCard from "@/features/entities/EntityDetailsCard";
import EntityMentions from "@/features/entities/EntityMentions";
import { FormerIdentitiesCard, SurvivorBanner } from "@/features/entities/EntityMergeCards";
import { useEntityBackTo } from "@/features/entities/useEntityBackTo";
import { useEntityDetail } from "@/features/entities/useEntityDetail";
import { useEntityMerges } from "@/features/entities/useEntityMerges";

export default function EntityDetailPage() {
  const { id: campaignId, entityId } = useParams();
  const backTo = useEntityBackTo(campaignId);
  const detail = useEntityDetail(campaignId, entityId);
  const { entity, role, item, backlinks, byId } = detail;
  const { survivorChain, formerIdentityIds, nameFor } = useEntityMerges(campaignId, entityId, byId);

  if (entity === undefined) return <Spinner variant="page" />;

  if (entity === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-parchment-100 px-6 text-center">
        <h1 className="font-display text-2xl font-semibold text-parchment-900">Entity not found</h1>
        <Link
          to={backTo}
          className="rounded-control bg-garnet-700 px-4 py-2 text-sm font-semibold text-parchment-50 hover:bg-garnet-800"
        >
          Back to campaign
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-parchment-100">
      <EntityDetailHeader entity={entity} role={role} backTo={backTo} />

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
        <SurvivorBanner
          entity={entity}
          survivorChain={survivorChain}
          nameFor={nameFor}
          campaignId={campaignId}
        />

        {detail.error && (
          <p className="rounded-control bg-garnet-50 px-3 py-2 text-sm font-semibold text-garnet-700">
            {detail.error}
          </p>
        )}

        {entity.type === "ITEM" && item && (
          <CampaignItemCard item={item} isOwner={role === "OWNER"} />
        )}

        <EntityDetailsCard
          entity={entity}
          role={role}
          editing={detail.editing}
          busy={detail.busy}
          form={detail.form}
          onEdit={detail.startEdit}
          onCancel={detail.cancelEdit}
          onSave={detail.handleSave}
          onToggleVisibility={detail.handleToggleVisibility}
          onDelete={detail.handleDelete}
        />

        <FormerIdentitiesCard
          formerIdentityIds={formerIdentityIds}
          nameFor={nameFor}
          campaignId={campaignId}
        />

        <EntityMentions backlinks={backlinks} byId={byId} campaignId={campaignId} />
      </main>
    </div>
  );
}
