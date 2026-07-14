import type { ReactNode } from "react";
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
import EntityPaneRail from "@/features/entities/EntityPaneRail";
import { useEntityBackTo } from "@/features/entities/useEntityBackTo";
import { useEntityDetail } from "@/features/entities/useEntityDetail";
import { useEntityMerges } from "@/features/entities/useEntityMerges";
import type { CampaignEntity } from "@/types/character";

type Detail = ReturnType<typeof useEntityDetail>;

function NotFound({ backTo }: { backTo: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-24 text-center">
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

function ArticleBody({
  detail,
  entity,
  campaignId,
  entityId,
  formerIdentityIds,
  nameFor,
}: {
  detail: Detail;
  entity: CampaignEntity;
  campaignId?: string;
  entityId?: string;
  formerIdentityIds: string[];
  nameFor: (id: string) => string;
}) {
  return (
    <article className="flex min-w-0 flex-col gap-6 xl:order-first">
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

      {entity.type === "ITEM" && detail.item && (
        <CampaignItemCard item={detail.item} isOwner={detail.role === "OWNER"} />
      )}

      <FormerIdentitiesCard
        formerIdentityIds={formerIdentityIds}
        nameFor={nameFor}
        campaignId={campaignId}
      />

      <EntityChronicle
        backlinks={detail.backlinks}
        entityId={entityId}
        byId={detail.byId}
        campaignId={campaignId}
      />

      <EntityConnections connections={detail.connections} campaignId={campaignId} />

      {!detail.editing && <EntityContributeBand name={entity.name} onEdit={detail.startEdit} />}
    </article>
  );
}

function EntityArticle({
  detail,
  entity,
  campaignId,
  entityId,
  backTo,
  viewerId,
  survivorChain,
  formerIdentityIds,
  nameFor,
}: {
  detail: Detail;
  entity: CampaignEntity;
  campaignId?: string;
  entityId?: string;
  backTo: string;
  viewerId?: string;
  survivorChain: string[];
  formerIdentityIds: string[];
  nameFor: (id: string) => string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
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
          role={detail.role}
          backTo={backTo}
          onEdit={detail.startEdit}
        />
      )}

      <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
        <EntityInfobox
          entity={entity}
          role={detail.role}
          backlinks={detail.backlinks}
          characters={detail.characters}
          viewerId={viewerId}
          busy={detail.busy}
          onToggleVisibility={detail.handleToggleVisibility}
          onDelete={detail.handleDelete}
        />
        <ArticleBody
          detail={detail}
          entity={entity}
          campaignId={campaignId}
          entityId={entityId}
          formerIdentityIds={formerIdentityIds}
          nameFor={nameFor}
        />
      </div>
    </div>
  );
}

// Wiki-article entity page (#842): a desktop split view — sibling-list rail +
// reading pane — that collapses to a full-page article on mobile. Loading and
// not-found render inside the pane so the rail keeps its state across row nav.
export default function EntityDetailPage() {
  const { id: campaignId, entityId } = useParams();
  const backTo = useEntityBackTo(campaignId);
  const detail = useEntityDetail(campaignId, entityId);
  const { entity } = detail;
  const { user } = useAuth();
  const { survivorChain, formerIdentityIds, nameFor } = useEntityMerges(
    campaignId,
    entityId,
    detail.byId,
  );

  let pane: ReactNode;
  if (entity === undefined) pane = <Spinner variant="page" />;
  else if (entity === null) pane = <NotFound backTo={backTo} />;
  else
    pane = (
      <EntityArticle
        detail={detail}
        entity={entity}
        campaignId={campaignId}
        entityId={entityId}
        backTo={backTo}
        viewerId={user?.id}
        survivorChain={survivorChain}
        formerIdentityIds={formerIdentityIds}
        nameFor={nameFor}
      />
    );

  return (
    <div className="min-h-screen bg-parchment-100">
      <main className="mx-auto flex max-w-6xl flex-col px-4 py-6 sm:px-6 sm:py-8 lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <EntityPaneRail
          campaignId={campaignId ?? ""}
          entities={detail.listed}
          currentEntityId={entityId}
        />
        <div className="min-w-0">{pane}</div>
      </main>
    </div>
  );
}
