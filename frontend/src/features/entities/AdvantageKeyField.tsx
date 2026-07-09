import Field from "@/components/ui/Field";
import Select from "@/components/ui/Select";
import { ABILITY_OPTIONS, SKILL_OPTIONS } from "@/lib/abilities";
import type { ItemCapability } from "@/types/character";

interface AdvantageKeyFieldProps {
  cap: ItemCapability;
  index: number;
  onUpdate: (patch: Partial<ItemCapability>) => void;
}

// The optional per-skill (check) or per-ability (save) qualifier for an
// advantage grant — a save stores an ability key, a check a skill key.
export default function AdvantageKeyField({ cap, index, onUpdate }: AdvantageKeyFieldProps) {
  const onSave = cap.grantOn === "save";
  const options = onSave ? ABILITY_OPTIONS : SKILL_OPTIONS;
  const valueKind = onSave ? ("save" as const) : ("skill" as const);
  return (
    <Field label={onSave ? "Which save (optional)" : "Which skill (optional)"} htmlFor={`cap-${index}-advkey`}>
      <Select
        id={`cap-${index}-advkey`}
        value={cap.grantValue ?? ""}
        onChange={(e) => onUpdate({ grantValueKind: valueKind, grantValue: e.target.value || undefined })}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </Select>
    </Field>
  );
}
