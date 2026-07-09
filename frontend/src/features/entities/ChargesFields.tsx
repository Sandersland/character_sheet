import Field from "@/components/ui/Field";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { CHARGE_TRIGGER_OPTIONS } from "@/lib/capabilities";
import type { ChargeTrigger, ItemCapability } from "@/types/character";

interface ChargesFieldsProps {
  cap: ItemCapability;
  index: number;
  onUpdate: (patch: Partial<ItemCapability>) => void;
}

// DM authoring for the item's shared charge pool (#555): max charges, recharge
// trigger, and an optional dice formula ("regains 1d6+1 at dawn"; unchecked =
// refills to max). castSpell capabilities spend from this via "Spends item charges".
export default function ChargesFields({ cap, index, onUpdate }: ChargesFieldsProps) {
  const recharge = cap.recharge ?? { trigger: "dawn" as ChargeTrigger };
  const rollToRegain = Boolean(recharge.dice);
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Field label="Max charges" htmlFor={`cap-${index}-maxcharges`}>
        <Input
          id={`cap-${index}-maxcharges`}
          type="number"
          min={1}
          className="text-parchment-900"
          value={cap.maxCharges ?? 7}
          onChange={(e) => onUpdate({ maxCharges: Number(e.target.value) })}
        />
      </Field>

      <Field label="Recharges" htmlFor={`cap-${index}-trigger`}>
        <Select
          id={`cap-${index}-trigger`}
          value={recharge.trigger}
          onChange={(e) => onUpdate({ recharge: { ...recharge, trigger: e.target.value as ChargeTrigger } })}
        >
          {CHARGE_TRIGGER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>

      <label className="flex items-center gap-2 text-xs text-parchment-700 sm:col-span-2">
        <input
          type="checkbox"
          checked={rollToRegain}
          onChange={(e) =>
            onUpdate({
              recharge: e.target.checked
                ? { ...recharge, dice: { count: 1, faces: 6 }, bonus: 1 }
                : { trigger: recharge.trigger },
            })
          }
        />
        Roll to regain (e.g. 1d6+1); unchecked refills to max
      </label>

      {rollToRegain && (
        <div className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-semibold text-parchment-700">Regain roll</span>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={1}
              aria-label={`Capability ${index + 1} recharge dice count`}
              fullWidth={false}
              className="w-14 text-center text-parchment-900"
              value={recharge.dice?.count ?? 1}
              onChange={(e) =>
                onUpdate({ recharge: { ...recharge, dice: { count: Number(e.target.value), faces: recharge.dice?.faces ?? 6 } } })
              }
            />
            <span aria-hidden="true" className="text-sm font-semibold text-parchment-600">d</span>
            <Input
              type="number"
              min={2}
              aria-label={`Capability ${index + 1} recharge dice faces`}
              fullWidth={false}
              className="w-14 text-center text-parchment-900"
              value={recharge.dice?.faces ?? 6}
              onChange={(e) =>
                onUpdate({ recharge: { ...recharge, dice: { count: recharge.dice?.count ?? 1, faces: Number(e.target.value) } } })
              }
            />
            <span aria-hidden="true" className="text-sm font-semibold text-parchment-600">+</span>
            <Input
              type="number"
              min={0}
              aria-label={`Capability ${index + 1} recharge bonus`}
              fullWidth={false}
              className="w-14 text-center text-parchment-900"
              value={recharge.bonus ?? 0}
              onChange={(e) => {
                const bonus = Number(e.target.value);
                onUpdate({ recharge: { ...recharge, bonus: bonus > 0 ? bonus : undefined } });
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
