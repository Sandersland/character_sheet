// #1689: the species-granted cantrip choice (High Elf's Cantrip) — driven
// purely by the served spec (CreationSpeciesCantripChoice.applicable);
// renders nothing when the server serves no chooseCantrip for the chosen
// species+variant. Reuses the SAME SpellPicker + useSpellCatalog machinery
// the class's own CreationSpellsStep uses (the #1377/#1572 server-filtering
// seam), queried against the spec's OWN class list rather than the
// character's class — a non-caster class (a High Elf Fighter) still gets
// this panel.
import Spinner from "@/components/ui/Spinner";
import { abilityLabel } from "@/lib/abilities";
import type { CreationSpeciesCantripChoice } from "@/lib/characterCreation";
import SpellPicker, { type SpellPickerGroup } from "@/features/spells/SpellPicker";
import { useSpellCatalog } from "@/features/spells/useSpellCatalog";

interface SpeciesCantripSectionProps {
  choice: CreationSpeciesCantripChoice;
  onChange: (spellId: string) => void;
}

// The `applicable` guard lives in the PARENT (below), not here: hooks must
// run unconditionally on every render, so the catalog fetch only exists at
// all once a child component is actually mounted — never firing a
// `className: ""` request for a species with no cantrip choice.
function SpeciesCantripPicker({
  choice,
  onChange,
}: {
  choice: CreationSpeciesCantripChoice;
  onChange: (spellId: string) => void;
}) {
  // Cantrips only (maxLevel: 0) — a species-granted cantrip choice never
  // reaches into leveled spells.
  const { catalog, error, showSpinner } = useSpellCatalog({ className: choice.list, maxLevel: 0 });

  const selectedIds = choice.selectedId ? [choice.selectedId] : [];
  const groups: SpellPickerGroup[] = [
    {
      key: "species-cantrip",
      label: "Cantrip",
      options: catalog ?? [],
      selectedIds,
      cap: 1,
      onToggle: (id) => onChange(selectedIds.includes(id) ? "" : id),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0">
        <h2 className="font-display text-xl font-semibold text-parchment-900">Species Cantrip</h2>
        <p className="mt-1 text-sm text-parchment-600">
          Choose one cantrip your species grants — {abilityLabel(choice.castingAbility)} is its casting ability.
        </p>
      </div>
      {error && <p className="mt-3 text-sm text-garnet-700">{error}</p>}
      {catalog === null && !error && showSpinner && <Spinner />}
      {catalog !== null && (
        <div className="mt-4 flex min-h-0 flex-1 flex-col">
          <SpellPicker groups={groups} />
        </div>
      )}
    </div>
  );
}

export default function SpeciesCantripSection({ choice, onChange }: SpeciesCantripSectionProps) {
  if (!choice.applicable) return null;
  return <SpeciesCantripPicker choice={choice} onChange={onChange} />;
}
