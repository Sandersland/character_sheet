// #1689/#1756: the species-granted cantrip choice — driven purely by the
// served spec (CreationSpeciesCantripChoice.applicable); renders nothing when
// the server serves no chooseCantrip. Reuses the SAME SpellPicker +
// useSpellCatalog machinery the class's own CreationSpellsStep uses (the
// #1377/#1572 server-filtering seam), so a non-caster class (a High Elf
// Fighter) still gets this panel. Two spec shapes: a class LIST (High Elf)
// queries the spec's OWN class list; a named SPELLS set (Astral Fire, #1756)
// fetches every cantrip and narrows to those names client-side (display-only
// — the backend re-validates the pick against the list).
import Spinner from "@/components/ui/Spinner";
import { abilityLabel } from "@/lib/abilities";
import type { CreationSpeciesCantripChoice } from "@/lib/characterCreation";
import SpellPicker, { type SpellPickerGroup } from "@/features/spells/SpellPicker";
import { useSpellCatalog } from "@/features/spells/useSpellCatalog";
import type { CatalogSpell } from "@/types/character";
import type { RulesEdition } from "@character-sheet/shared-types";

interface SpeciesCantripSectionProps {
  choice: CreationSpeciesCantripChoice;
  edition: RulesEdition;
  onChange: (spellId: string) => void;
}

// #1756: a `spells` spec narrows the fetched catalog to its named cantrips; a
// `list` spec already fetched only that class list, so it takes everything.
function narrowedCantrips(catalog: CatalogSpell[] | null, choice: CreationSpeciesCantripChoice): CatalogSpell[] {
  const all = catalog ?? [];
  return choice.spells ? all.filter((s) => choice.spells!.includes(s.name)) : all;
}

// #1756: names the spec's fixed ability (High Elf) or defers to the player's
// own Int/Wis/Cha choice (Astral Fire).
function castingAbilityCopy(choice: CreationSpeciesCantripChoice): string {
  return choice.castingAbility ? `${abilityLabel(choice.castingAbility)} is its casting ability` : "your chosen casting ability applies to it";
}

// The `applicable` guard lives in the PARENT (below), not here: hooks must
// run unconditionally on every render, so the catalog fetch only exists at
// all once a child component is actually mounted — never firing a
// `className: ""` request for a species with no cantrip choice.
function SpeciesCantripPicker({
  choice,
  edition,
  onChange,
}: {
  choice: CreationSpeciesCantripChoice;
  edition: RulesEdition;
  onChange: (spellId: string) => void;
}) {
  // Cantrips only (maxLevel: 0) — a species-granted cantrip choice never
  // reaches into leveled spells. A `spells` spec (#1756) has no class list, so
  // it fetches every cantrip and narrows to its named options below; a `list`
  // spec queries that class list server-side.
  const { catalog, error, showSpinner } = useSpellCatalog(edition, { className: choice.list, maxLevel: 0 });

  const selectedIds = choice.selectedId ? [choice.selectedId] : [];
  const groups: SpellPickerGroup[] = [
    {
      key: "species-cantrip",
      label: "Cantrip",
      options: narrowedCantrips(catalog, choice),
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
          Choose one cantrip your species grants — {castingAbilityCopy(choice)}.
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

export default function SpeciesCantripSection({ choice, edition, onChange }: SpeciesCantripSectionProps) {
  if (!choice.applicable) return null;
  return <SpeciesCantripPicker choice={choice} edition={edition} onChange={onChange} />;
}
