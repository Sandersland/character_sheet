import Field from "@/components/ui/Field";
import Select from "@/components/ui/Select";
import AdvantageKeyField from "@/features/entities/AdvantageKeyField";
import { ADVANTAGE_ON_OPTIONS } from "@/lib/capabilities";
import { applyAdvantageOn } from "@/lib/capabilityDraft";
import type { ItemCapability } from "@/types/character";

interface AdvantageGrantFieldsProps {
  cap: ItemCapability;
  index: number;
  onUpdate: (patch: Partial<ItemCapability>) => void;
}

// The advantage grant branch (#529): an axis (check/save/initiative/attack) plus
// an optional per-skill (check) or per-ability (save) qualifier.
export default function AdvantageGrantFields({ cap, index, onUpdate }: AdvantageGrantFieldsProps) {
  const keyed = cap.grantOn === "check" || cap.grantOn === "save" || cap.grantOn === undefined;
  return (
    <>
      <Field label="On" htmlFor={`cap-${index}-on`}>
        <Select
          id={`cap-${index}-on`}
          value={cap.grantOn ?? "check"}
          onChange={(e) => onUpdate(applyAdvantageOn(e.target.value as ItemCapability["grantOn"]))}
        >
          {ADVANTAGE_ON_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </Field>

      {keyed && <AdvantageKeyField cap={cap} index={index} onUpdate={onUpdate} />}

      <label className="flex items-center gap-2 text-xs text-parchment-700 sm:col-span-2">
        <input type="checkbox" checked={cap.cantBeSurprised ?? false} onChange={(e) => onUpdate({ cantBeSurprised: e.target.checked })} />
        Also can&apos;t be surprised (Weapon of Warning)
      </label>
    </>
  );
}
