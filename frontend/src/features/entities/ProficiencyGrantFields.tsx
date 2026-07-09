import Field from "@/components/ui/Field";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { ABILITY_OPTIONS, SKILL_OPTIONS } from "@/lib/abilities";
import { PROFICIENCY_KIND_OPTIONS } from "@/lib/capabilities";
import { applyProfKind } from "@/lib/capabilityDraft";
import type { ItemCapability, ProficiencyKind } from "@/types/character";

interface ProficiencyGrantFieldsProps {
  cap: ItemCapability;
  index: number;
  onUpdate: (patch: Partial<ItemCapability>) => void;
}

// The proficiency grant branch (#529): a kind (skill/save/weapon/tool/language)
// plus its value — chosen from a list for skill/save, free-text otherwise.
export default function ProficiencyGrantFields({ cap, index, onUpdate }: ProficiencyGrantFieldsProps) {
  return (
    <>
      <Field label="Proficiency" htmlFor={`cap-${index}-profkind`}>
        <Select
          id={`cap-${index}-profkind`}
          value={(cap.grantValueKind as ProficiencyKind) ?? "skill"}
          onChange={(e) => onUpdate(applyProfKind(e.target.value as ProficiencyKind))}
        >
          {PROFICIENCY_KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </Field>
      {cap.grantValueKind === "skill" ? (
        <Field label="Skill" htmlFor={`cap-${index}-profval`}>
          <Select id={`cap-${index}-profval`} value={cap.grantValue ?? "perception"} onChange={(e) => onUpdate({ grantValue: e.target.value })}>
            {SKILL_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </Select>
        </Field>
      ) : cap.grantValueKind === "save" ? (
        <Field label="Saving throw" htmlFor={`cap-${index}-profval`}>
          <Select id={`cap-${index}-profval`} value={cap.grantValue ?? "strength"} onChange={(e) => onUpdate({ grantValue: e.target.value })}>
            {ABILITY_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field label="Name" htmlFor={`cap-${index}-profval`}>
          <Input id={`cap-${index}-profval`} placeholder="e.g. Longswords" value={cap.grantValue ?? ""} onChange={(e) => onUpdate({ grantValue: e.target.value || undefined })} />
        </Field>
      )}
    </>
  );
}
