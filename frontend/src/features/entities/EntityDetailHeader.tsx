import { Link } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import { Lock } from "@/components/ui/icons";
import { ENTITY_TYPE_LABELS, ENTITY_TYPE_TONE } from "@/lib/mentions";
import type { CampaignEntity, CampaignRole } from "@/types/character";

export default function EntityDetailHeader({
  entity,
  role,
  backTo,
}: {
  entity: CampaignEntity;
  role?: CampaignRole;
  backTo: string;
}) {
  return (
    <div className="border-b border-parchment-200 bg-parchment-50">
      <div className="mx-auto max-w-3xl px-6 py-5">
        <Link to={backTo} className="text-xs font-semibold text-garnet-700 hover:underline">
          ← Back to campaign
        </Link>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 font-display text-2xl font-semibold text-parchment-900">
          {entity.name}
          <Badge tone={ENTITY_TYPE_TONE[entity.type]}>{ENTITY_TYPE_LABELS[entity.type]}</Badge>
          {role === "OWNER" && entity.visibility === "HIDDEN" && (
            <Badge tone="neutral">
              <Lock aria-hidden="true" className="h-3 w-3" />
              Hidden
            </Badge>
          )}
        </h1>
      </div>
    </div>
  );
}
