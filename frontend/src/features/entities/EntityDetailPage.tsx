import { Link, useParams } from "react-router-dom";

import Spinner from "@/components/ui/Spinner";
import { useAuth } from "@/features/auth/AuthProvider";
import CampaignItemCard from "@/features/entities/CampaignItemCard";
import EntityArticleHeader from "@/features/entities/EntityArticleHeader";
import EntityChronicle from "@/features/entities/EntityChronicle";
import EntityConnections from "@/features/entities/EntityConnections";
import EntityContributeBand from "@/features/entities/EntityContributeBand";
import EntityEditForm from "@/features/entities/EntityEditForm";
import EntityInfobox from "@/features/entities/EntityInfobox";
import { FormerIdentitiesCard, SurvivorBanner } from "@/features/entities/EntityMergeCards";
import { useEntityBackTo } from "@/features/entities/useEntityBackTo";
import { useEntityDetail } from "@/features/entities/useEntityDetail";
import { useEntityMerges } from "@/features/entities/useEntityMerges";

// Wiki-article entity page (#842): masthead + lead, derived-facts infobox,
// session-grouped chronicle, co-mention connections, and a contribute band.
export default function EntityDetailPage() {
  const { id: campaignId, entityId } = useParams();
  const backTo = useEntityBackTo(campaignId);
  const detail = useEntityDetail(campaignId, entityId);
  const { entity, role, item, backlinks, connections, characters, byId } = detail;
  const { user } = useAuth();
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
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
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

        {!detail.editing && (
          <EntityArticleHeader
            entity={entity}
            role={role}
            backTo={backTo}
            onEdit={detail.startEdit}
          />
        )}

        <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
          <EntityInfobox
            entity={entity}
            role={role}
            backlinks={backlinks}
            characters={characters}
            viewerId={user?.id}
            busy={detail.busy}
            onToggleVisibility={detail.handleToggleVisibility}
            onDelete={detail.handleDelete}
          />
          <article className="flex flex-col gap-6 xl:order-first">
            {detail.editing ? (
              <EntityEditForm
                form={detail.form}
                busy={detail.busy}
                onSave={detail.handleSave}
                onCancel={detail.cancelEdit}
              />
            ) : (
              entity.notes?.trim() && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-parchment-800">
                  {entity.notes}
                </p>
              )
            )}

            {entity.type === "ITEM" && item && (
              <CampaignItemCard item={item} isOwner={role === "OWNER"} />
            )}

            <FormerIdentitiesCard
              formerIdentityIds={formerIdentityIds}
              nameFor={nameFor}
              campaignId={campaignId}
            />

            <EntityChronicle
              backlinks={backlinks}
              entityId={entityId}
              byId={byId}
              campaignId={campaignId}
            />

            <EntityConnections connections={connections} campaignId={campaignId} />

            {!detail.editing && (
              <EntityContributeBand name={entity.name} onEdit={detail.startEdit} />
            )}
          </article>
        </div>
      </main>
    </div>
  );
}
