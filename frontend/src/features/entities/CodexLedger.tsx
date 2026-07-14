import { useRef, type DOMAttributes } from "react";
import { Link } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import { Lock } from "@/components/ui/icons";
import EntityPortrait from "@/features/entities/EntityPortrait";
import EntityPreviewCard from "@/features/entities/EntityPreviewCard";
import { useEntityPreview, type PreviewEntity } from "@/features/entities/useEntityPreview";
import { notesSnippet, type CodexSort, type LetterGroup } from "@/lib/codexLedger";
import { ENTITY_TYPE_LABELS, ENTITY_TYPE_TONE } from "@/lib/mentions";
import type { CampaignEntity, CampaignRole } from "@/types/character";

interface CodexLedgerProps {
  campaignId: string;
  groups: LetterGroup[];
  matchedInNotesIds: ReadonlySet<string>;
  role?: CampaignRole;
  // Mention sorts (#853) receive one ranked pseudo-group and render it flat.
  sort: CodexSort;
}

const ALPHABET = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];

function EntityRow({
  campaignId,
  entity,
  matchedInNotes,
  isOwner,
  previewTriggerProps,
}: {
  campaignId: string;
  entity: CampaignEntity;
  matchedInNotes: boolean;
  isOwner: boolean;
  previewTriggerProps: (entity: PreviewEntity) => DOMAttributes<HTMLElement>;
}) {
  const hidden = entity.visibility === "HIDDEN";
  const snippet = notesSnippet(entity.notes);
  const ordinal = entity.stats?.lastMentioned?.sessionOrdinal;
  return (
    <li>
      <Link
        to={`/campaigns/${campaignId}/entities/${entity.id}`}
        {...previewTriggerProps(entity)}
        className={`flex items-center gap-3 rounded-control px-1 py-2 hover:bg-parchment-100 ${
          hidden ? "opacity-60" : ""
        }`}
      >
        <EntityPortrait
          name={entity.name}
          type={entity.type}
          portraitUrl={entity.portraitUrl}
          className="h-11 w-11 text-lg"
        />
        <span className="flex min-w-0 grow flex-col">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-display text-sm font-semibold text-parchment-900">
              {entity.name}
            </span>
            {entity.aliases.length > 0 && (
              <span className="truncate text-xs italic text-parchment-500">
                {entity.aliases.join(", ")}
              </span>
            )}
          </span>
          <span
            className={`truncate text-xs ${snippet ? "text-parchment-600" : "italic text-parchment-400"}`}
          >
            {snippet ?? "No description yet — add what you know"}
          </span>
          {matchedInNotes && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gold-800">
              Matched in description
            </span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="flex items-center gap-1.5">
            {isOwner && hidden && (
              <Badge tone="neutral">
                <Lock aria-hidden="true" className="h-3 w-3" />
                Hidden
              </Badge>
            )}
            <Badge tone={ENTITY_TYPE_TONE[entity.type]}>{ENTITY_TYPE_LABELS[entity.type]}</Badge>
          </span>
          {entity.stats && (
            <span className="text-[10px] tabular-nums text-parchment-500">
              {`${entity.stats.mentionCount} ✎${ordinal != null ? ` · Session ${ordinal}` : ""}`}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

// The chronicle ledger (#840): A→Z letter-divided entity rows with type-tinted
// serif monogram tiles, plus an alphabet jump rail on the list's right edge.
export default function CodexLedger({
  campaignId,
  groups,
  matchedInNotesIds,
  role,
  sort,
}: CodexLedgerProps) {
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const present = new Set(groups.map((g) => g.letter));
  const isOwner = role === "OWNER";
  const isAlpha = sort === "alpha";
  // One shared hover-preview controller for every row (#843).
  const preview = useEntityPreview(campaignId);

  // scrollIntoView is banned here; compute the target offset ourselves.
  function jumpTo(letter: string) {
    const el = sectionRefs.current.get(letter);
    if (!el) return;
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - 72,
      behavior: "smooth",
    });
  }

  return (
    <div className="flex min-w-0 grow items-start gap-2">
      <div className="min-w-0 grow">
        {!isAlpha ? (
          <ul className="flex flex-col divide-y divide-parchment-200">
            {groups
              .flatMap((g) => g.entities)
              .map((e) => (
                <EntityRow
                  key={e.id}
                  campaignId={campaignId}
                  entity={e}
                  matchedInNotes={matchedInNotesIds.has(e.id)}
                  isOwner={isOwner}
                  previewTriggerProps={preview.triggerProps}
                />
              ))}
          </ul>
        ) : (
          groups.map((group) => (
            <section
              key={group.letter}
              aria-label={`Entries starting with ${group.letter}`}
              ref={(el) => {
                if (el) sectionRefs.current.set(group.letter, el);
                else sectionRefs.current.delete(group.letter);
              }}
            >
              <div className="flex items-center gap-3 pb-1 pt-4 first:pt-0">
                <span className="font-display text-lg font-semibold text-garnet-700">
                  {group.letter}
                </span>
                <span aria-hidden="true" className="h-px grow bg-parchment-200" />
              </div>
              <ul className="flex flex-col divide-y divide-parchment-200">
                {group.entities.map((e) => (
                  <EntityRow
                    key={e.id}
                    campaignId={campaignId}
                    entity={e}
                    matchedInNotes={matchedInNotesIds.has(e.id)}
                    isOwner={isOwner}
                    previewTriggerProps={preview.triggerProps}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
      {isAlpha && (
        <nav
          aria-label="Jump to letter"
          className="sticky top-6 hidden shrink-0 flex-col items-center sm:flex"
        >
          {ALPHABET.map((letter) => (
            <button
              key={letter}
              type="button"
              disabled={!present.has(letter)}
              onClick={() => jumpTo(letter)}
              className={`px-1 text-[10px] font-semibold leading-4 ${
                present.has(letter)
                  ? "text-garnet-700 hover:text-garnet-800"
                  : "cursor-default text-parchment-300"
              }`}
            >
              {letter}
            </button>
          ))}
        </nav>
      )}
      <EntityPreviewCard preview={preview.open} />
    </div>
  );
}
