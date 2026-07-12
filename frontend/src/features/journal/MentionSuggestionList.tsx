// The @-tag autocomplete popover: entity matches + an optional create row (#609).
// Presentation only — insert/create intent is delegated to the parent via
// onSelect/onCreate; keyboard nav + open/close state live in useMentionEditor.
// Two presentations (#785): an absolute top-full popover at md+, and an in-flow
// keyboard-aware scroll list below md so it isn't clipped under the keyboard.

import { useEffect, useRef, type Ref } from "react";

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
  /** Render in document flow (below md) instead of an absolute popover. */
  inFlow?: boolean;
  /** Cap for the in-flow scroll list, derived from the keyboard-aware height. */
  maxHeight?: number;
}

// max-h-[40vh] is the self-defending fallback — the caller normally caps via the
// inline maxHeight style, but the list must stay bounded even without it.
const IN_FLOW_CLASS =
  "mt-1 max-h-[40vh] overflow-y-auto rounded-card border border-parchment-200 bg-parchment-50 py-1 shadow-raised";
const POPOVER_CLASS =
  "absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-card border border-parchment-200 bg-parchment-50 py-1 shadow-raised";

interface MatchRowProps {
  entity: CampaignEntity;
  index: number;
  active: boolean;
  survivor: string | null;
  activeRef: Ref<HTMLLIElement>;
  optionId: (index: number) => string;
  onSelect: (entityId: string) => void;
  onHover: (index: number) => void;
}

function MatchRow({ entity, index, active, survivor, activeRef, optionId, onSelect, onHover }: MatchRowProps) {
  return (
    <li
      ref={active ? activeRef : undefined}
      id={optionId(index)}
      role="option"
      aria-selected={active}
      className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm ${
        active ? "bg-garnet-50 text-garnet-900" : "text-parchment-800"
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
}

interface CreateRowProps {
  index: number;
  active: boolean;
  creating: boolean;
  createName: string;
  createType: EntityType;
  activeRef: Ref<HTMLLIElement>;
  optionId: (index: number) => string;
  onCreate: () => void;
  onHover: (index: number) => void;
}

function CreateRow({ index, active, creating, createName, createType, activeRef, optionId, onCreate, onHover }: CreateRowProps) {
  return (
    <li
      ref={active ? activeRef : undefined}
      id={optionId(index)}
      role="option"
      aria-selected={active}
      className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${
        active ? "bg-garnet-50 text-garnet-900" : "text-parchment-700"
      }`}
      onMouseDown={(e) => {
        e.preventDefault();
        onCreate();
      }}
      onMouseEnter={() => onHover(index)}
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
  );
}

// Keyboard-nav parity: keep the active option in view as the user arrows
// (both variants — the md+ popover scrolls long match lists too).
function useActiveOptionScroll(activeIndex: number) {
  const activeRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);
  return activeRef;
}

type SuggestionOptionsProps = Omit<MentionSuggestionListProps, "listboxId" | "inFlow" | "maxHeight"> & {
  merges: ReturnType<typeof useCampaignMerges>["merges"];
  activeRef: Ref<HTMLLIElement>;
};

function SuggestionOptions({
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
  merges,
  activeRef,
}: SuggestionOptionsProps) {
  return (
    <>
      {matches.map((entity, index) => (
        <MatchRow
          key={entity.id}
          entity={entity}
          index={index}
          active={index === activeIndex}
          survivor={ultimateSurvivorName(merges, byId, entity.id)}
          activeRef={activeRef}
          optionId={optionId}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}
      {showCreate && (
        <CreateRow
          index={matches.length}
          active={activeIndex === matches.length}
          creating={creating}
          createName={createName}
          createType={createType}
          activeRef={activeRef}
          optionId={optionId}
          onCreate={onCreate}
          onHover={onHover}
        />
      )}
    </>
  );
}

export default function MentionSuggestionList(props: MentionSuggestionListProps) {
  const { campaignId, listboxId, inFlow = false, maxHeight } = props;
  const { merges } = useCampaignMerges(campaignId);
  const activeRef = useActiveOptionScroll(props.activeIndex);

  return (
    <ul
      id={listboxId}
      role="listbox"
      aria-label="Tag suggestions"
      className={inFlow ? IN_FLOW_CLASS : POPOVER_CLASS}
      style={inFlow && maxHeight != null ? { maxHeight } : undefined}
    >
      <SuggestionOptions {...props} merges={merges} activeRef={activeRef} />
    </ul>
  );
}
