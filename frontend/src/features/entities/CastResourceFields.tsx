import Field from "@/components/ui/Field";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { CAST_RESOURCE_OPTIONS } from "@/lib/capabilities";
import type { ItemCapability } from "@/types/character";

interface CastResourceFieldsProps {
  cap: ItemCapability;
  index: number;
  onChange: (patch: Partial<ItemCapability>) => void;
}

// The cast resource picker plus its count: charges spend a per-cast cost, timed
// resources take uses-per-period, at-will takes neither (#528).
export default function CastResourceFields({ cap, index, onChange }: CastResourceFieldsProps) {
  return (
    <>
      <Field label="Resource" htmlFor={`cap-${index}-resource`}>
        <Select
          id={`cap-${index}-resource`}
          value={cap.resource ?? "perRestShort"}
          onChange={(e) => onChange({ resource: e.target.value as ItemCapability["resource"] })}
        >
          {CAST_RESOURCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>

      {cap.resource === "charges" ? (
        <Field label="Charges per cast" htmlFor={`cap-${index}-chargecost`}>
          <Input
            id={`cap-${index}-chargecost`}
            type="number"
            min={1}
            className="text-parchment-900"
            value={cap.chargeCost ?? 1}
            onChange={(e) => onChange({ chargeCost: Number(e.target.value) })}
          />
        </Field>
      ) : (
        cap.resource !== "atWill" && (
          <Field label="Uses per period" htmlFor={`cap-${index}-uses`}>
            <Input
              id={`cap-${index}-uses`}
              type="number"
              className="text-parchment-900"
              value={cap.uses ?? 1}
              onChange={(e) => onChange({ uses: Number(e.target.value) })}
            />
          </Field>
        )
      )}
    </>
  );
}
