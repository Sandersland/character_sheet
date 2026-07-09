import Field from "@/components/ui/Field";
import Select from "@/components/ui/Select";
import AdvantageGrantFields from "@/features/entities/AdvantageGrantFields";
import ProficiencyGrantFields from "@/features/entities/ProficiencyGrantFields";
import { GRANT_TYPE_OPTIONS } from "@/lib/capabilities";
import { applyGrantType } from "@/lib/capabilityDraft";
import { CONDITION_OPTIONS } from "@/lib/conditions";
import { DAMAGE_TYPES, damageTypeLabel } from "@/lib/damageTypes";
import type { GrantType, ItemCapability } from "@/types/character";

interface GrantFieldsProps {
  cap: ItemCapability;
  index: number;
  onUpdate: (patch: Partial<ItemCapability>) => void;
}

// DM authoring for a grant capability (#529). Value pickers resolve through the
// label helpers — a skill/ability/condition/damage-type is chosen, never typed.
export default function GrantFields({ cap, index, onUpdate }: GrantFieldsProps) {
  const type = cap.grantType ?? "resistance";
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Field label="Grant" htmlFor={`cap-${index}-grantType`}>
        <Select id={`cap-${index}-grantType`} value={type} onChange={(e) => onUpdate(applyGrantType(e.target.value as GrantType))}>
          {GRANT_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </Field>

      {(type === "resistance" || type === "immunity") && (
        <Field label="Damage type" htmlFor={`cap-${index}-dmg`}>
          <Select id={`cap-${index}-dmg`} value={cap.grantValue ?? "fire"} onChange={(e) => onUpdate({ grantValueKind: "damageType", grantValue: e.target.value })}>
            {DAMAGE_TYPES.map((t) => (
              <option key={t} value={t}>{damageTypeLabel(t)}</option>
            ))}
          </Select>
        </Field>
      )}

      {type === "conditionImmunity" && (
        <Field label="Condition" htmlFor={`cap-${index}-cond`}>
          <Select id={`cap-${index}-cond`} value={cap.grantValue ?? "poisoned"} onChange={(e) => onUpdate({ grantValueKind: "condition", grantValue: e.target.value })}>
            {CONDITION_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </Select>
        </Field>
      )}

      {type === "advantage" && <AdvantageGrantFields cap={cap} index={index} onUpdate={onUpdate} />}

      {type === "proficiency" && <ProficiencyGrantFields cap={cap} index={index} onUpdate={onUpdate} />}
    </div>
  );
}
