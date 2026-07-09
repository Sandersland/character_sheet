import Field from "@/components/ui/Field";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import DiceValueInput from "@/features/entities/DiceValueInput";
import { CAPABILITY_OP_OPTIONS, CAPABILITY_TARGET_OPTIONS } from "@/lib/capabilities";
import { applyDiceToggle, applyTarget, keyOptions } from "@/lib/capabilityDraft";
import type { CapabilityTarget, ItemCapability } from "@/types/character";

interface PassiveBonusFieldsProps {
  cap: ItemCapability;
  index: number;
  onChange: (patch: Partial<ItemCapability>) => void;
}

// DM authoring for a passiveBonus capability (#546): a {target, op, value|dice,
// condition} row. Damage bonuses can be dice-valued (e.g. +2d6 fire).
export default function PassiveBonusFields({ cap, index, onChange }: PassiveBonusFieldsProps) {
  const target = cap.target ?? "ac";
  const opts = keyOptions(target);
  const useDice = Boolean(cap.dice);
  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Affects" htmlFor={`cap-${index}-target`}>
          <Select
            id={`cap-${index}-target`}
            value={target}
            onChange={(e) => onChange(applyTarget(cap, e.target.value as CapabilityTarget))}
          >
            {CAPABILITY_TARGET_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        {opts.length > 0 && (
          <Field label="Which" htmlFor={`cap-${index}-key`}>
            <Select
              id={`cap-${index}-key`}
              value={cap.targetKey ?? opts[0].key}
              onChange={(e) => onChange({ targetKey: e.target.value })}
            >
              {opts.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Operation" htmlFor={`cap-${index}-op`}>
          <Select
            id={`cap-${index}-op`}
            value={cap.op ?? "add"}
            onChange={(e) => onChange({ op: e.target.value as ItemCapability["op"] })}
          >
            {CAPABILITY_OP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        {useDice ? (
          <DiceValueInput index={index} dice={cap.dice} onChange={onChange} />
        ) : (
          <Field label="Value" htmlFor={`cap-${index}-value`}>
            <Input
              id={`cap-${index}-value`}
              type="number"
              className="text-parchment-900"
              value={cap.value ?? 0}
              onChange={(e) => onChange({ value: Number(e.target.value) })}
            />
          </Field>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs text-parchment-700">
        <input type="checkbox" checked={useDice} onChange={(e) => onChange(applyDiceToggle(e.target.checked))} />
        Dice-valued (e.g. +2d6 fire)
      </label>

      <Field label="Condition (optional)" htmlFor={`cap-${index}-condition`}>
        <Input
          id={`cap-${index}-condition`}
          placeholder="e.g. on hit"
          value={cap.condition ?? ""}
          onChange={(e) => onChange({ condition: e.target.value || undefined })}
        />
      </Field>
    </>
  );
}
