import { Link } from "react-router-dom";

import Card from "@/components/ui/Card";
import type { CampaignEntity } from "@/types/character";

export function SurvivorBanner({
  entity,
  survivorChain,
  nameFor,
  campaignId,
}: {
  entity: CampaignEntity;
  survivorChain: string[];
  nameFor: (id: string) => string;
  campaignId?: string;
}) {
  if (survivorChain.length === 0) return null;
  return (
    <div className="rounded-card border border-garnet-200 bg-garnet-50 px-4 py-3 text-sm text-garnet-900">
      <p className="font-semibold">
        Revealed to be{" "}
        <Link
          to={`/campaigns/${campaignId}/entities/${survivorChain[0]}`}
          className="text-garnet-700 hover:underline"
        >
          @{nameFor(survivorChain[0])}
        </Link>
      </p>
      {survivorChain.length > 1 && (
        <p className="mt-1 text-xs text-garnet-700">
          {[entity.name, ...survivorChain.map(nameFor)].join(" → ")}
        </p>
      )}
    </div>
  );
}

export function FormerIdentitiesCard({
  formerIdentityIds,
  nameFor,
  campaignId,
}: {
  formerIdentityIds: string[];
  nameFor: (id: string) => string;
  campaignId?: string;
}) {
  if (formerIdentityIds.length === 0) return null;
  return (
    <Card title="Former identities" headingLevel={2} className="p-4">
      <div className="flex flex-col gap-1 p-4">
        <p className="text-xs text-parchment-600">Identities revealed to be this being.</p>
        <ul className="mt-1 flex flex-col gap-1">
          {formerIdentityIds.map((fid) => (
            <li key={fid}>
              <Link
                to={`/campaigns/${campaignId}/entities/${fid}`}
                className="text-sm font-semibold text-garnet-700 hover:underline"
              >
                {nameFor(fid)}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
