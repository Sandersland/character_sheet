import { Lock } from "@/components/ui/icons";
import Badge from "@/components/ui/Badge";
import { ENTITY_TYPE_LABELS, ENTITY_TYPE_TONE } from "@/lib/mentions";
import type { InboxDuplicateEntity } from "@/types/character";

interface SurvivorPickerProps {
  entities: InboxDuplicateEntity[];
  groupName: string;
  survivorId: string;
  onSelect: (entityId: string) => void;
}

export default function SurvivorPicker({ entities, groupName, survivorId, onSelect }: SurvivorPickerProps) {
  return (
    <fieldset className="flex flex-col divide-y divide-parchment-200 rounded-card border border-parchment-200">
      <legend className="sr-only">Choose which entry to keep</legend>
      {entities.map((entity) => (
        <SurvivorPickerRow
          key={entity.id}
          entity={entity}
          groupName={groupName}
          kept={entity.id === survivorId}
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
  onSelect,
}: {
  entity: InboxDuplicateEntity;
  groupName: string;
  kept: boolean;
  onSelect: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-parchment-50">
      <input
        type="radio"
        name={groupName}
        checked={kept}
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
        className={`shrink-0 text-xs font-semibold ${kept ? "text-vitality-700" : "text-parchment-500"}`}
      >
        {kept ? "Kept" : "Combined"}
      </span>
    </label>
  );
}
