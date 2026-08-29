import { type ReactNode } from "react";

import Spinner from "@/components/ui/Spinner";
import SpellPickerTabs from "@/features/spells/SpellPickerTabs";
import type { SpellPickerGroup } from "@/features/spells/SpellPicker";
import { useSpellCatalog } from "@/features/spells/useSpellCatalog";
import { abilityLabel } from "@/lib/abilities";
import type { CreationSpeciesCantripChoice } from "@/lib/characterCreation";
import {
  creationLeveledPickCap,
  splitCreationCatalog,
  toggleCreationPick,
  type CreationSpellCounts,
} from "@/lib/creationSpells";
import type { CharacterDraft } from "@/hooks/useCharacterDraft";
import type { CatalogSpell } from "@/types/character";
import type { RulesEdition } from "@character-sheet/shared-types";

// Prepared-spell count is deliberately omitted: it's ability-score-dependent (2014 INT-mod formula) and not on ClassOption, so the sheet computes it after creation.
function spellbookNote(spellbookSize: number): string {
  return `All ${spellbookSize} spells you choose are scribed into your spellbook, but only some can be prepared for casting at a time. After creation, your sheet marks which are prepared — you can swap them when you rest.`;
}

function castingAbilityNote(choice: CreationSpeciesCantripChoice): string {
  const ability = choice.castingAbility
    ? `${abilityLabel(choice.castingAbility)} is its casting ability`
    : "your chosen casting ability applies to it";
  return `Choose one cantrip your species grants — ${ability}.`;
}

// A `list` spec's catalog is already filtered server-side; only a `spells` spec needs narrowing here.
function narrowedCantrips(catalog: CatalogSpell[] | null, choice: CreationSpeciesCantripChoice): CatalogSpell[] {
  const all = catalog ?? [];
  return choice.spells ? all.filter((s) => choice.spells!.includes(s.name)) : all;
}

function buildClassGroups(
  counts: CreationSpellCounts,
  options: ReturnType<typeof splitCreationCatalog>,
  cantripIds: string[],
  spellIds: string[],
  onChange: (patch: Partial<CharacterDraft>) => void,
): SpellPickerGroup[] {
  const groups: SpellPickerGroup[] = [];
  if (counts.cantrips > 0) {
    groups.push({
      key: "cantrips",
      label: "Cantrips",
      options: options.cantrips,
      selectedIds: cantripIds,
      cap: counts.cantrips,
      onToggle: (id) => onChange({ cantripIds: toggleCreationPick(cantripIds, id, counts.cantrips) }),
    });
  }
  if (counts.spells > 0) {
    const cap = creationLeveledPickCap(counts);
    groups.push({
      key: "spells",
      label: counts.spellbookSize != null ? "Spellbook" : "Spells",
      options: options.spells,
      selectedIds: spellIds,
      cap,
      onToggle: (id) => onChange({ spellIds: toggleCreationPick(spellIds, id, cap) }),
      ...(counts.spellbookSize != null ? { note: spellbookNote(counts.spellbookSize) } : {}),
    });
  }
  return groups;
}

function CatalogStatus({ error, showSpinner }: { error: string | null; showSpinner: boolean }) {
  if (error) return <p className="mt-3 text-sm text-garnet-700">{error}</p>;
  return showSpinner ? <Spinner /> : null;
}

function ClassSpellGate({
  className,
  subclassId,
  counts,
  cantripIds,
  spellIds,
  edition,
  onChange,
  children,
}: {
  className: string;
  subclassId?: string;
  counts: CreationSpellCounts;
  cantripIds: string[];
  spellIds: string[];
  edition: RulesEdition;
  onChange: (patch: Partial<CharacterDraft>) => void;
  children: (groups: SpellPickerGroup[]) => ReactNode;
}) {
  const { catalog, error, showSpinner } = useSpellCatalog(edition, { className, maxLevel: counts.maxSpellLevel, subclassId });
  if (catalog === null) return <CatalogStatus error={error} showSpinner={showSpinner} />;
  return <>{children(buildClassGroups(counts, splitCreationCatalog(catalog), cantripIds, spellIds, onChange))}</>;
}

// Only mounted when choice.applicable — hooks must run unconditionally, so mounting conditionally avoids firing a className: "" fetch for a species with no cantrip choice.
function SpeciesCantripGate({
  choice,
  edition,
  onChange,
  children,
}: {
  choice: CreationSpeciesCantripChoice;
  edition: RulesEdition;
  onChange: (spellId: string) => void;
  children: (groups: SpellPickerGroup[]) => ReactNode;
}) {
  const { catalog, error, showSpinner } = useSpellCatalog(edition, { className: choice.list, maxLevel: 0 });
  if (catalog === null) return <CatalogStatus error={error} showSpinner={showSpinner} />;
  const selectedIds = choice.selectedId ? [choice.selectedId] : [];
  const group: SpellPickerGroup = {
    key: "species-cantrip",
    label: "Species",
    options: narrowedCantrips(catalog, choice),
    selectedIds,
    cap: 1,
    onToggle: (id) => onChange(selectedIds.includes(id) ? "" : id),
    note: castingAbilityNote(choice),
  };
  return <>{children([group])}</>;
}

function TabsPanel({ groups }: { groups: SpellPickerGroup[] }) {
  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col">
      <SpellPickerTabs groups={groups} />
    </div>
  );
}

export default function CreationSpellsStep({
  className,
  subclassId,
  counts,
  cantripIds,
  spellIds,
  speciesCantripChoice,
  edition,
  onChange,
  onSpeciesCantripChange,
}: {
  className: string;
  // Chosen subclass's catalog id (e.g. a 2014 Warlock patron) that widens the served spell pool; empty when no subclass is chosen yet or the class is a non-caster.
  subclassId?: string;
  // Undefined for a non-caster class — it still reaches this step for its species cantrip alone.
  counts?: CreationSpellCounts;
  cantripIds: string[];
  spellIds: string[];
  speciesCantripChoice: CreationSpeciesCantripChoice;
  edition: RulesEdition;
  onChange: (patch: Partial<CharacterDraft>) => void;
  onSpeciesCantripChange: (spellId: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0">
        <h2 className="font-display text-xl font-semibold text-parchment-900">Learn your magic</h2>
        <p className="mt-1 text-sm text-parchment-600">
          Choose the cantrips and spells your character starts knowing.
        </p>
      </div>
      {speciesCantripChoice.applicable ? (
        <SpeciesCantripGate choice={speciesCantripChoice} edition={edition} onChange={onSpeciesCantripChange}>
          {(speciesGroups) =>
            counts ? (
              <ClassSpellGate
                className={className}
                subclassId={subclassId}
                counts={counts}
                cantripIds={cantripIds}
                spellIds={spellIds}
                edition={edition}
                onChange={onChange}
              >
                {(classGroups) => <TabsPanel groups={[...speciesGroups, ...classGroups]} />}
              </ClassSpellGate>
            ) : (
              <TabsPanel groups={speciesGroups} />
            )
          }
        </SpeciesCantripGate>
      ) : (
        counts && (
          <ClassSpellGate
            className={className}
            subclassId={subclassId}
            counts={counts}
            cantripIds={cantripIds}
            spellIds={spellIds}
            edition={edition}
            onChange={onChange}
          >
            {(classGroups) => <TabsPanel groups={classGroups} />}
          </ClassSpellGate>
        )
      )}
    </div>
  );
}
