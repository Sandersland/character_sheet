import { INPUT_CLS, LABEL_CLS } from "@/lib/addSpell";
import type { HomebrewSpellInput } from "@/types/character";

type Components = NonNullable<HomebrewSpellInput["components"]>;

interface HomebrewSpellComponentsFieldsProps {
  components: Components;
  onChange: (next: Components) => void;
}

export default function HomebrewSpellComponentsFields({ components, onChange }: HomebrewSpellComponentsFieldsProps) {
  return (
    <fieldset>
      <legend className="mb-1 block text-xs font-semibold text-parchment-700">Components</legend>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs text-parchment-700">
          <input
            type="checkbox"
            checked={components.verbal}
            onChange={(e) => onChange({ ...components, verbal: e.target.checked })}
          />
          Verbal (V)
        </label>
        <label className="flex items-center gap-1.5 text-xs text-parchment-700">
          <input
            type="checkbox"
            checked={components.somatic}
            onChange={(e) => onChange({ ...components, somatic: e.target.checked })}
          />
          Somatic (S)
        </label>
        <label className="flex items-center gap-1.5 text-xs text-parchment-700">
          <input
            type="checkbox"
            checked={components.material}
            onChange={(e) => onChange({ ...components, material: e.target.checked })}
          />
          Material (M)
        </label>
      </div>
      {components.material && (
        <div className="mt-2">
          <label className={LABEL_CLS} htmlFor="homebrew-material-description">Material component</label>
          <input
            id="homebrew-material-description"
            className={INPUT_CLS}
            value={components.materialDescription ?? ""}
            onChange={(e) => onChange({ ...components, materialDescription: e.target.value })}
            placeholder="a pinch of sulfur"
          />
        </div>
      )}
    </fieldset>
  );
}
