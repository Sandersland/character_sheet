interface AutoRollConcentrationToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

/** Spellcaster-only "auto-roll concentration saves" checkbox (issue #76). */
export default function AutoRollConcentrationToggle({
  checked,
  onChange,
  disabled,
}: AutoRollConcentrationToggleProps) {
  return (
    <label className="flex items-center gap-2 text-xs text-parchment-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-3.5 w-3.5 rounded border-parchment-400 text-arcane-700 focus:ring-arcane-600"
      />
      Auto-roll concentration saves
    </label>
  );
}
