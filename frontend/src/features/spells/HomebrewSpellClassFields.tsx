// Class-access multi-select for the homebrew-spell form: checkboxes sourced
// from GET /api/reference's own class catalog (#1787) — the same catalog
// validateCustomSpellClasses checks server-side, so every option offered
// here is guaranteed to pass that check.
import type { ClassOption } from "@/types/character";

interface HomebrewSpellClassFieldsProps {
  classes: ClassOption[] | null;
  selected: string[];
  onChange: (next: string[]) => void;
}

export default function HomebrewSpellClassFields({ classes, selected, onChange }: HomebrewSpellClassFieldsProps) {
  function toggle(name: string) {
    onChange(selected.includes(name) ? selected.filter((c) => c !== name) : [...selected, name]);
  }

  return (
    <fieldset>
      <legend className="mb-1 block text-xs font-semibold text-parchment-700">Class access</legend>
      {classes === null ? (
        <p className="text-xs text-parchment-500">Loading classes…</p>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {classes.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5 text-xs text-parchment-700">
              <input type="checkbox" checked={selected.includes(c.name)} onChange={() => toggle(c.name)} />
              {c.name}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
