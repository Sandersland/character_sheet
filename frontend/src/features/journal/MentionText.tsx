import { Fragment } from "react";
import { Link } from "react-router-dom";

import { Lock } from "@/components/ui/icons";
import EntityPreviewCard from "@/features/entities/EntityPreviewCard";
import { useEntityPreview } from "@/features/entities/useEntityPreview";
import {
  ENTITY_TYPE_INK_BORDER_CLASS,
  ENTITY_TYPE_INK_TEXT_CLASS,
  MENTION_INK_BASE_CLASS,
  parseMentionBody,
} from "@/lib/mentions";
import type { CampaignEntity } from "@/types/character";

type MentionEntity = Pick<CampaignEntity, "name" | "type" | "aliases" | "notes" | "visibility">;

interface MentionTextProps {
  body: string;
  entities: Map<string, MentionEntity>;
  campaignId?: string | null;
  className?: string;
}

export default function MentionText({ body, entities, campaignId, className }: MentionTextProps) {
  const segments = parseMentionBody(body);
  const preview = useEntityPreview(campaignId);

  return (
    <p className={className}>
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <Fragment key={index}>{segment.value}</Fragment>;
        }
        const entity = entities.get(segment.id);
        if (!entity) {
          return (
            <span
              key={index}
              aria-label="Hidden entity"
              className={`inline-flex items-baseline gap-1 font-semibold text-parchment-500 [font-variant-caps:small-caps]`}
            >
              <Lock aria-hidden="true" className="h-3 w-3 self-center" />
              Hidden
            </span>
          );
        }
        const inkClass = `${MENTION_INK_BASE_CLASS} ${ENTITY_TYPE_INK_TEXT_CLASS[entity.type]} ${ENTITY_TYPE_INK_BORDER_CLASS[entity.type]}`;
        return campaignId ? (
          <Link
            key={index}
            to={`/campaigns/${campaignId}/entities/${segment.id}`}
            {...preview.triggerProps({ id: segment.id, ...entity })}
            className={`${inkClass} hover:opacity-80 focus:outline-none focus-visible:rounded-xs focus-visible:ring-2 focus-visible:ring-garnet-400`}
          >
            {entity.name}
          </Link>
        ) : (
          <span key={index} className={inkClass}>
            {entity.name}
          </span>
        );
      })}
      <EntityPreviewCard preview={preview.open} />
    </p>
  );
}
