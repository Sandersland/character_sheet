import Input from "@/components/ui/Input";

export interface DiceValue {
  count: string;
  faces: string;
  modifier?: string;
  type?: string;
}

interface DiceInputProps {
  value: DiceValue;
  onChange: (value: DiceValue) => void;
  label: string;
  idPrefix: string;
  showModifier?: boolean;
  showType?: boolean;
  className?: string;
}

// Compound NdF (+M) [type] dice control. Numeric inputs force text-parchment-900
// so the digits stay legible against the dark-mode control surface.
const numCls = "w-14 text-center text-parchment-900";

export default function DiceInput({
  value,
  onChange,
  label,
  idPrefix,
  showModifier = false,
  showType = false,
  className = "",
}: DiceInputProps) {
  return (
    <fieldset className={`flex min-w-0 flex-wrap items-center gap-1.5 ${className}`}>
      <legend className="mb-1 text-xs font-semibold text-parchment-700">{label}</legend>
      <Input
        id={`${idPrefix}-count`}
        type="number"
        aria-label={`${label} dice count`}
        fullWidth={false}
        className={numCls}
        value={value.count}
        onChange={(e) => onChange({ ...value, count: e.target.value })}
      />
      <span aria-hidden="true" className="text-sm font-semibold text-parchment-600">
        d
      </span>
      <Input
        id={`${idPrefix}-faces`}
        type="number"
        aria-label={`${label} dice faces`}
        fullWidth={false}
        className={numCls}
        value={value.faces}
        onChange={(e) => onChange({ ...value, faces: e.target.value })}
      />
      {showModifier && (
        <>
          <span aria-hidden="true" className="text-sm font-semibold text-parchment-600">
            +
          </span>
          <Input
            id={`${idPrefix}-mod`}
            type="number"
            aria-label={`${label} modifier`}
            fullWidth={false}
            className={numCls}
            value={value.modifier ?? ""}
            onChange={(e) => onChange({ ...value, modifier: e.target.value })}
          />
        </>
      )}
      {showType && (
        <Input
          id={`${idPrefix}-type`}
          type="text"
          aria-label={`${label} type`}
          fullWidth={false}
          className="w-28 text-parchment-900"
          value={value.type ?? ""}
          onChange={(e) => onChange({ ...value, type: e.target.value })}
        />
      )}
    </fieldset>
  );
}
