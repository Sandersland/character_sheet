import { useEffect, useRef, type Ref } from "react";

import { Plus } from "@/components/ui/icons";
import { useCampaignMerges } from "@/hooks/useCampaignMerges";
import {
  ENTITY_TYPE_DOT_CLASS,
  ENTITY_TYPE_INK_TEXT_CLASS,
  ENTITY_TYPE_LABELS,
} from "@/lib/mentions";
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
  inFlow?: boolean;
  maxHeight?: number;
  placement?: "above" | "below";
}

// max-h-[40vh] is a fallback bound — the list must stay bounded even without the caller's inline maxHeight.
const IN_FLOW_CLASS =
  "mt-1 max-h-[40vh] overflow-y-auto rounded-card border border-parchment-200 bg-parchment-50 py-1 shadow-raised";
const POPOVER_BASE =
  "absolute left-0 right-0 z-50 max-h-60 overflow-y-auto rounded-card border border-parchment-200 bg-parchment-50 py-1 shadow-raised";
// POPOVER_ABOVE exists for the dock composer, whose field sits at the panel's bottom edge — below would spill off-screen.
const POPOVER_BELOW = `${POPOVER_BASE} top-full mt-1`;
const POPOVER_ABOVE = `${POPOVER_BASE} bottom-full mb-1`;

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
      className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${
        active ? "bg-garnet-50" : ""
      }`}
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect(entity.id);
      }}
      onMouseEnter={() => onHover(index)}
    >
      {/* Type is visual-only here; the sr-only label below announces it to screen readers. */}
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rotate-45 ${ENTITY_TYPE_DOT_CLASS[entity.type]}`}
      />
      <span className="min-w-0 truncate">
        <span className={`font-semibold [font-variant-caps:small-caps] ${ENTITY_TYPE_INK_TEXT_CLASS[entity.type]}`}>
          {entity.name}
        </span>
        <span className="sr-only"> ({ENTITY_TYPE_LABELS[entity.type]})</span>
        {survivor ? (
          <span className="ml-1 text-xs font-normal text-parchment-500">→ {survivor}</span>
        ) : null}
      </span>
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
  const { campaignId, listboxId, inFlow = false, maxHeight, placement = "below" } = props;
  const { merges } = useCampaignMerges(campaignId);
  const activeRef = useActiveOptionScroll(props.activeIndex);
  const popoverClass = placement === "above" ? POPOVER_ABOVE : POPOVER_BELOW;

  return (
    <ul
      id={listboxId}
      role="listbox"
      aria-label="Tag suggestions"
      className={inFlow ? IN_FLOW_CLASS : popoverClass}
      style={inFlow && maxHeight != null ? { maxHeight } : undefined}
    >
      <SuggestionOptions {...props} merges={merges} activeRef={activeRef} />
    </ul>
  );
}
