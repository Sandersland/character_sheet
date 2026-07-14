import { Link } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import { Lock } from "@/components/ui/icons";
import { ENTITY_TYPE_LABELS, ENTITY_TYPE_TONE } from "@/lib/mentions";
import type { CampaignEntity, CampaignRole } from "@/types/character";

// Wiki-article masthead (#842): serif H1 + type badge, alias line, hairline rule.
export default function EntityArticleHeader({
  entity,
  role,
  backTo,
  onEdit,
}: {
  entity: CampaignEntity;
  role?: CampaignRole;
  backTo: string;
  onEdit: () => void;
}) {
  return (
    <header className="flex flex-col gap-1.5">
      <Link to={backTo} className="text-xs font-semibold text-garnet-700 hover:underline lg:hidden">
        ← Codex
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="font-display text-3xl font-semibold text-parchment-900">{entity.name}</h1>
        <Badge tone={ENTITY_TYPE_TONE[entity.type]}>{ENTITY_TYPE_LABELS[entity.type]}</Badge>
        {role === "OWNER" && entity.visibility === "HIDDEN" && (
          <Badge tone="neutral">
            <Lock aria-hidden="true" className="h-3 w-3" />
            Hidden
          </Badge>
        )}
        <button
          type="button"
          onClick={onEdit}
          className="ml-auto text-xs font-semibold text-garnet-700 hover:underline"
        >
          Edit entry
        </button>
      </div>
      {entity.aliases.length > 0 && (
        <p className="text-sm italic text-parchment-600">
          Also known as {entity.aliases.join(", ")}
        </p>
      )}
      <span aria-hidden="true" className="mt-1.5 h-px bg-parchment-300" />
    </header>
  );
}
