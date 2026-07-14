// Renders a stored note body with @[<uuid>] tokens as entity chips (#248).
// Plain text is verbatim; a known id becomes a Badge-styled chip linking to the
// entity detail page (name resolved AT RENDER so a rename reflects instantly).
// An unresolved id — a now-hidden entity a non-owner can't see (#379), or a
// deleted one — renders as a redacted chip (no link, no preview), never the raw
// token. Chips carry the shared desktop hover preview (#843), hover-lazy so a
// long session log costs zero fetches to render.

import { Fragment } from "react";
import { Link } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import { Lock } from "@/components/ui/icons";
import EntityPreviewCard from "@/features/entities/EntityPreviewCard";
import { useEntityPreview } from "@/features/entities/useEntityPreview";
import { ENTITY_TYPE_TONE, parseMentionBody } from "@/lib/mentions";
import type { CampaignEntity } from "@/types/character";

type MentionEntity = Pick<CampaignEntity, "name" | "type" | "aliases" | "notes" | "visibility">;

interface MentionTextProps {
  body: string;
  /** id→entity lookup (from useCampaignEntities). */
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
            <Badge key={index} tone="neutral">
              <span aria-label="Hidden entity" className="inline-flex items-center gap-1">
                <Lock aria-hidden="true" className="h-3 w-3" />
                Hidden
              </span>
            </Badge>
          );
        }
        const chip = <Badge tone={ENTITY_TYPE_TONE[entity.type]}>@{entity.name}</Badge>;
        return campaignId ? (
          <Link
            key={index}
            to={`/campaigns/${campaignId}/entities/${segment.id}`}
            {...preview.triggerProps({ id: segment.id, ...entity })}
            className="rounded-full hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-garnet-400"
          >
            {chip}
          </Link>
        ) : (
          <Fragment key={index}>{chip}</Fragment>
        );
      })}
      <EntityPreviewCard preview={preview.open} />
    </p>
  );
}
