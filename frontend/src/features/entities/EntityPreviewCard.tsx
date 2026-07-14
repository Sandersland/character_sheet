import { createPortal } from "react-dom";

import Badge from "@/components/ui/Badge";
import { Lock } from "@/components/ui/icons";
import EntityPortrait from "@/features/entities/EntityPortrait";
import { ENTITY_TYPE_LABELS, ENTITY_TYPE_TONE } from "@/lib/mentions";
import type { EntityPreview } from "@/features/entities/useEntityPreview";

const CARD_WIDTH = 304;
const CARD_MAX_HEIGHT = 320;
const GAP = 12;
const EDGE = 8;

// Fixed-position beside the anchor: prefer right, flip left near the edge, clamp vertically.
function cardPosition(anchor: DOMRect): { left: number; top: number } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let left = anchor.right + GAP;
  if (left + CARD_WIDTH > viewportWidth - EDGE) left = anchor.left - GAP - CARD_WIDTH;
  left = Math.max(EDGE, Math.min(left, viewportWidth - CARD_WIDTH - EDGE));
  const top = Math.max(EDGE, Math.min(anchor.top, viewportHeight - CARD_MAX_HEIGHT - EDGE));
  return { left, top };
}

function previewFooter(preview: EntityPreview): string | null {
  const stats = preview.stats;
  if (!stats) return null;
  const mentions = `${stats.mentionCount} ${stats.mentionCount === 1 ? "mention" : "mentions"}`;
  const ordinal = stats.lastMentioned?.sessionOrdinal;
  return ordinal ? `${mentions} · last in Session ${ordinal}` : mentions;
}

// Non-interactive hover preview (#843): a pure enhancement, hidden from AT and pointer-events.
export default function EntityPreviewCard({ preview }: { preview: EntityPreview | null }) {
  if (!preview) return null;
  const { entity, connections } = preview;
  const { left, top } = cardPosition(preview.anchorRect);
  const footer = previewFooter(preview);
  const notes = entity.notes?.trim();

  return createPortal(
    <div
      aria-hidden="true"
      data-testid="entity-preview-card"
      style={{ left, top, width: CARD_WIDTH, maxHeight: CARD_MAX_HEIGHT }}
      className="pointer-events-none fixed z-50 overflow-hidden rounded-card border border-parchment-200 bg-parchment-50 p-4 shadow-raised"
    >
      <div className="flex items-start gap-3">
        <EntityPortrait
          name={entity.name}
          type={entity.type}
          portraitUrl={entity.portraitUrl}
          className="h-11 w-11 text-lg"
        />
        <span className="flex min-w-0 grow flex-col">
          <span className="truncate font-display text-base font-semibold text-parchment-900">
            {entity.name}
          </span>
          {entity.aliases.length > 0 && (
            <span className="truncate text-xs italic text-parchment-500">
              {entity.aliases.join(", ")}
            </span>
          )}
        </span>
        {entity.visibility === "HIDDEN" && (
          <Badge tone="neutral">
            <Lock className="h-3 w-3" />
            Hidden
          </Badge>
        )}
      </div>
      <p
        className={`mt-2 line-clamp-3 whitespace-pre-line text-sm ${notes ? "text-parchment-700" : "italic text-parchment-400"}`}
      >
        {notes || "No description yet — add what you know"}
      </p>
      {connections && connections.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {connections.map((c) => (
            <Badge key={c.entity.id} tone={ENTITY_TYPE_TONE[c.entity.type]}>
              {c.entity.name}
              <span className="opacity-70">×{c.count}</span>
            </Badge>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-parchment-200 pt-2 text-xs text-parchment-500">
        <span className="truncate">
          {footer ?? ENTITY_TYPE_LABELS[entity.type]}
        </span>
        <span className="shrink-0 font-medium text-parchment-600">Open ↵</span>
      </div>
    </div>,
    document.body,
  );
}
