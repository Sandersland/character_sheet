import { Check, Lock } from "@/components/ui/icons";
import Badge from "@/components/ui/Badge";
import { ENTITY_TYPE_LABELS, ENTITY_TYPE_TONE } from "@/lib/mentions";
import type { InboxDuplicateEntity } from "@/types/character";

interface SurvivorPickerProps {
  entities: InboxDuplicateEntity[];
  groupName: string;
  survivorId: string;
  onSelect: (entityId: string) => void;
  /** Locked once any combine has landed — switching the survivor mid-batch
   *  would leave an already-combined entity pointed at the wrong keeper. */
  locked: boolean;
  landedIds: Set<string>;
}

// The Review-duplicates modal's bordered survivor list (#1946), split out of
// the modal body to keep its own complexity — one row per cluster entity —
// separate from the modal's commit/retry state machine.
export default function SurvivorPicker({
  entities,
  groupName,
  survivorId,
  onSelect,
  locked,
  landedIds,
}: SurvivorPickerProps) {
  return (
    <fieldset className="flex flex-col divide-y divide-parchment-200 rounded-card border border-parchment-200">
      <legend className="sr-only">Choose which entry to keep</legend>
      {entities.map((entity) => (
        <SurvivorPickerRow
          key={entity.id}
          entity={entity}
          groupName={groupName}
          kept={entity.id === survivorId}
          landed={landedIds.has(entity.id)}
          locked={locked}
          onSelect={() => onSelect(entity.id)}
        />
      ))}
    </fieldset>
  );
}

function SurvivorPickerRow({
  entity,
  groupName,
  kept,
  landed,
  locked,
  onSelect,
}: {
  entity: InboxDuplicateEntity;
  groupName: string;
  kept: boolean;
  landed: boolean;
  locked: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 ${locked ? "cursor-default" : "hover:bg-parchment-50"}`}
    >
      <input
        type="radio"
        name={groupName}
        checked={kept}
        disabled={locked}
        onChange={onSelect}
        className="accent-garnet-600"
      />
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm font-semibold text-parchment-900">{entity.name}</span>
        <Badge tone={ENTITY_TYPE_TONE[entity.type]}>{ENTITY_TYPE_LABELS[entity.type]}</Badge>
        {entity.visibility === "HIDDEN" && (
          <Lock aria-hidden="true" className="h-3 w-3 shrink-0 text-parchment-500" />
        )}
      </span>
      <span className="shrink-0 text-xs text-parchment-500">
        {entity.mentionCount} {entity.mentionCount === 1 ? "mention" : "mentions"}
      </span>
      <span
        className={`flex shrink-0 items-center gap-1 text-xs font-semibold ${kept ? "text-vitality-700" : "text-parchment-500"}`}
      >
        {landed && <Check aria-hidden="true" className="h-3 w-3" />}
        {kept ? "Kept" : "Combined"}
      </span>
    </label>
  );
}
