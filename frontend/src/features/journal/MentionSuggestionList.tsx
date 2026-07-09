// The @-tag autocomplete popover: entity matches + an optional create row (#609).
// Presentation only — insert/create intent is delegated to the parent via
// onSelect/onCreate; keyboard nav + open/close state live in useMentionEditor.

import Badge from "@/components/ui/Badge";
import { Plus } from "@/components/ui/icons";
import { useCampaignMerges } from "@/hooks/useCampaignMerges";
import { ENTITY_TYPE_LABELS, ENTITY_TYPE_TONE } from "@/lib/mentions";
import { ultimateSurvivorName } from "@/lib/merges";
import type { CampaignEntity, EntityType } from "@/types/character";

interface MentionSuggestionListProps {
  campaignId?: string | null;
  listboxId: string;
  matches: CampaignEntity[];
  byId: Map<string, CampaignEntity>;
  activeIndex: number;
  showCreate: boolean;
  createName: string;
  createType: EntityType;
  creating: boolean;
  optionId: (index: number) => string;
  onSelect: (entityId: string) => void;
  onCreate: () => void;
  onHover: (index: number) => void;
}

export default function MentionSuggestionList({
  campaignId,
  listboxId,
  matches,
  byId,
  activeIndex,
  showCreate,
  createName,
  createType,
  creating,
  optionId,
  onSelect,
  onCreate,
  onHover,
}: MentionSuggestionListProps) {
  const { merges } = useCampaignMerges(campaignId);

  return (
    <ul
      id={listboxId}
      role="listbox"
      aria-label="Tag suggestions"
      className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-card border border-parchment-200 bg-parchment-50 py-1 shadow-raised"
    >
      {matches.map((entity, index) => {
        const survivor = ultimateSurvivorName(merges, byId, entity.id);
        return (
          <li
            key={entity.id}
            id={optionId(index)}
            role="option"
            aria-selected={index === activeIndex}
            className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm ${
              index === activeIndex ? "bg-garnet-50 text-garnet-900" : "text-parchment-800"
            }`}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(entity.id);
            }}
            onMouseEnter={() => onHover(index)}
          >
            <span className="min-w-0 truncate">
              {entity.name}
              {survivor ? (
                <span className="ml-1 text-xs font-normal text-parchment-500">→ {survivor}</span>
              ) : null}
            </span>
            <Badge tone={ENTITY_TYPE_TONE[entity.type]}>{ENTITY_TYPE_LABELS[entity.type]}</Badge>
          </li>
        );
      })}
      {showCreate && (
        <li
          id={optionId(matches.length)}
          role="option"
          aria-selected={activeIndex === matches.length}
          className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${
            activeIndex === matches.length ? "bg-garnet-50 text-garnet-900" : "text-parchment-700"
          }`}
          onMouseDown={(e) => {
            e.preventDefault();
            onCreate();
          }}
          onMouseEnter={() => onHover(matches.length)}
        >
          {creating ? (
            "Creating…"
          ) : (
            <>
              <Plus aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              {`Create ${ENTITY_TYPE_LABELS[createType]} “${createName}”`}
            </>
          )}
        </li>
      )}
    </ul>
  );
}
