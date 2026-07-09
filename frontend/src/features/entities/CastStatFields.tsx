import Field from "@/components/ui/Field";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { CAST_STAT_MODE_OPTIONS } from "@/lib/capabilities";
import type { CastStatMode } from "@/types/character";

interface CastStatFieldsProps {
  index: number;
  kind: "dc" | "atk";
  mode: CastStatMode | undefined;
  value: number | undefined;
  fallbackValue: number;
  spellcasterAttunable: boolean;
  onMode: (mode: CastStatMode) => void;
  onValue: (value: number) => void;
}

// The mode picker + numeric value for a castSpell's Save DC or Attack bonus.
// "Wielder's own" hides the value and needs a spellcaster-attunable item (#528).
export default function CastStatFields({ index, kind, mode, value, fallbackValue, spellcasterAttunable, onMode, onValue }: CastStatFieldsProps) {
  const modeLabel = kind === "dc" ? "Save DC" : "Attack bonus";
  const valueLabel = kind === "dc" ? "DC value" : "Attack value";
  const resolvedMode = mode ?? "fixed";
  return (
    <>
      <Field label={modeLabel} htmlFor={`cap-${index}-${kind}mode`}>
        <Select id={`cap-${index}-${kind}mode`} value={resolvedMode} onChange={(e) => onMode(e.target.value as CastStatMode)}>
          {CAST_STAT_MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} disabled={o.value === "wielder" && !spellcasterAttunable}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>

      {resolvedMode !== "wielder" && (
        <Field label={valueLabel} htmlFor={`cap-${index}-${kind}value`}>
          <Input
            id={`cap-${index}-${kind}value`}
            type="number"
            className="text-parchment-900"
            value={value ?? fallbackValue}
            onChange={(e) => onValue(Number(e.target.value))}
          />
        </Field>
      )}
    </>
  );
}
