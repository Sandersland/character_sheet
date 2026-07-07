import Field from "@/components/ui/Field";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { Plus, Trash2 } from "@/components/ui/icons";
import { ABILITY_OPTIONS, SKILL_OPTIONS } from "@/lib/abilities";
import {
  CAPABILITY_OP_OPTIONS,
  CAPABILITY_TARGET_OPTIONS,
  capabilitySummary,
  targetUsesAbilityKey,
  targetUsesSkillKey,
} from "@/lib/capabilities";
import type { CapabilityTarget, ItemCapability } from "@/types/character";

interface CapabilityEditorProps {
  capabilities: ItemCapability[];
  onChange: (capabilities: ItemCapability[]) => void;
}

const NEW_CAPABILITY: ItemCapability = { kind: "passiveBonus", target: "ac", op: "add", value: 1 };

// The key options for a target that names a skill/ability via targetKey.
function keyOptions(target: CapabilityTarget): readonly { key: string; label: string }[] {
  if (targetUsesSkillKey(target)) return SKILL_OPTIONS;
  if (targetUsesAbilityKey(target)) return ABILITY_OPTIONS;
  return [];
}

// DM authoring for an item's passiveBonus capabilities (#546). Each row is a
// {target, op, value|dice, condition} bonus; damage bonuses can be dice-valued
// (e.g. +2d6 fire). Add/remove multiple. Labels resolve through the helpers.
export default function CapabilityEditor({ capabilities, onChange }: CapabilityEditorProps) {
  function update(index: number, patch: Partial<ItemCapability>) {
    onChange(capabilities.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function setTarget(index: number, target: CapabilityTarget) {
    // Reset targetKey when the new target no longer keys off a skill/ability.
    const opts = keyOptions(target);
    const cap = capabilities[index];
    const targetKey = opts.length > 0 ? (opts.some((o) => o.key === cap.targetKey) ? cap.targetKey : opts[0].key) : undefined;
    update(index, { target, targetKey });
  }

  function toggleDice(index: number, useDice: boolean) {
    update(index, useDice ? { dice: { count: 1, faces: 6 }, value: undefined } : { dice: undefined, value: 1 });
  }

  function remove(index: number) {
    onChange(capabilities.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-parchment-700">Capabilities</span>
        <button
          type="button"
          onClick={() => onChange([...capabilities, { ...NEW_CAPABILITY }])}
          className="inline-flex items-center gap-1 text-xs font-semibold text-garnet-700 hover:underline"
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          Add capability
        </button>
      </div>

      {capabilities.length === 0 ? (
        <p className="text-xs text-parchment-500">No passive bonuses. Add one to grant a stat while active.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {capabilities.map((cap, index) => {
            const target = cap.target ?? "ac";
            const opts = keyOptions(target);
            const useDice = Boolean(cap.dice);
            return (
              <li
                key={index}
                className="flex flex-col gap-2 rounded-control border border-parchment-200 bg-parchment-50 p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium text-parchment-800">{capabilitySummary(cap)}</span>
                  <button
                    type="button"
                    aria-label={`Remove capability ${index + 1}`}
                    onClick={() => remove(index)}
                    className="flex h-6 w-6 items-center justify-center rounded-control text-parchment-500 hover:bg-parchment-200 hover:text-garnet-700"
                  >
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Field label="Affects" htmlFor={`cap-${index}-target`}>
                    <Select
                      id={`cap-${index}-target`}
                      value={target}
                      onChange={(e) => setTarget(index, e.target.value as CapabilityTarget)}
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
                        onChange={(e) => update(index, { targetKey: e.target.value })}
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
                      onChange={(e) => update(index, { op: e.target.value as ItemCapability["op"] })}
                    >
                      {CAPABILITY_OP_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  {useDice ? (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-parchment-700">Dice value</span>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          aria-label={`Capability ${index + 1} dice count`}
                          fullWidth={false}
                          className="w-14 text-center text-parchment-900"
                          value={cap.dice?.count ?? 1}
                          onChange={(e) =>
                            update(index, { dice: { count: Number(e.target.value), faces: cap.dice?.faces ?? 6, damageType: cap.dice?.damageType } })
                          }
                        />
                        <span aria-hidden="true" className="text-sm font-semibold text-parchment-600">d</span>
                        <Input
                          type="number"
                          aria-label={`Capability ${index + 1} dice faces`}
                          fullWidth={false}
                          className="w-14 text-center text-parchment-900"
                          value={cap.dice?.faces ?? 6}
                          onChange={(e) =>
                            update(index, { dice: { count: cap.dice?.count ?? 1, faces: Number(e.target.value), damageType: cap.dice?.damageType } })
                          }
                        />
                        <Input
                          type="text"
                          aria-label={`Capability ${index + 1} damage type`}
                          fullWidth={false}
                          placeholder="type"
                          className="w-24 text-parchment-900"
                          value={cap.dice?.damageType ?? ""}
                          onChange={(e) =>
                            update(index, { dice: { count: cap.dice?.count ?? 1, faces: cap.dice?.faces ?? 6, damageType: e.target.value || undefined } })
                          }
                        />
                      </div>
                    </div>
                  ) : (
                    <Field label="Value" htmlFor={`cap-${index}-value`}>
                      <Input
                        id={`cap-${index}-value`}
                        type="number"
                        className="text-parchment-900"
                        value={cap.value ?? 0}
                        onChange={(e) => update(index, { value: Number(e.target.value) })}
                      />
                    </Field>
                  )}
                </div>

                <label className="flex items-center gap-2 text-xs text-parchment-700">
                  <input type="checkbox" checked={useDice} onChange={(e) => toggleDice(index, e.target.checked)} />
                  Dice-valued (e.g. +2d6 fire)
                </label>

                <Field label="Condition (optional)" htmlFor={`cap-${index}-condition`}>
                  <Input
                    id={`cap-${index}-condition`}
                    placeholder="e.g. on hit"
                    value={cap.condition ?? ""}
                    onChange={(e) => update(index, { condition: e.target.value || undefined })}
                  />
                </Field>

                <Field label="Description (optional)" htmlFor={`cap-${index}-desc`}>
                  <Input
                    id={`cap-${index}-desc`}
                    value={cap.description ?? ""}
                    onChange={(e) => update(index, { description: e.target.value || undefined })}
                  />
                </Field>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
