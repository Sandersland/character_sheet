// The guided Spells step (#1160): a level-1 caster learns its starting
// cantrips + level-1 spells through the shared SpellPicker, and (#1689) a
// species with its own cantrip choice (High Elf, Astral Fire) gets that pick
// too — the SAME server-filtering seam (#1377/#1572), so a non-caster class
// still reaches this step for its species cantrip alone. #1778 merged the
// former SpeciesCantripSection in here and replaced the old two-scroller
// stack with SpellPickerTabs: exactly one full-height picker at a time,
// ordered species cantrip (when applicable) → class cantrips → class
// spells/spellbook.
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

// #1513: shown only for the Wizard (counts.spellbookSize present) — the
// prepared number is deliberately unstated: it's ability-score-dependent
// (2014's INT-mod formula) and not on ClassOption, so the sheet is the source
// of truth for it after creation.
function spellbookNote(spellbookSize: number): string {
  return `All ${spellbookSize} spells you choose are scribed into your spellbook, but only some can be prepared for casting at a time. After creation, your sheet marks which are prepared — you can swap them when you rest.`;
}

// #1756: names the spec's fixed ability (High Elf) or defers to the player's
// own Int/Wis/Cha choice (Astral Fire) — this becomes the species tab's
// sub-header via SpellPickerGroup's own `note`.
function castingAbilityNote(choice: CreationSpeciesCantripChoice): string {
  const ability = choice.castingAbility
    ? `${abilityLabel(choice.castingAbility)} is its casting ability`
    : "your chosen casting ability applies to it";
  return `Choose one cantrip your species grants — ${ability}.`;
}

// #1756: a `spells` spec narrows the fetched catalog to its named cantrips; a
// `list` spec already fetched only that class list, so it takes everything.
function narrowedCantrips(catalog: CatalogSpell[] | null, choice: CreationSpeciesCantripChoice): CatalogSpell[] {
  const all = catalog ?? [];
  return choice.spells ? all.filter((s) => choice.spells!.includes(s.name)) : all;
}

// Builds the class caster's two groups (cantrips, then leveled spells) from
// the served counts + already-split catalog. Split out of the component so
// its branching doesn't count against the component's own complexity gate;
// the #1513 spellbook relabel/note only touches the leveled-spells branch.
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

// The class band's own catalog fetch — mounted only when the class actually
// has level-1 picks (`counts` present). Mirrors SpeciesCantripGate's own
// mount-guard below, for the same reason: a non-caster class must never fire
// this fetch at all.
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

// The species cantrip's own catalog fetch — mounted only when the served spec
// applies (`choice.applicable`). Hooks must run unconditionally, so the fetch
// only exists at all once THIS component is mounted, never firing a
// `className: ""` request for a species with no cantrip choice. Cantrips only
// (maxLevel: 0) — a species-granted cantrip choice never reaches into leveled
// spells. A `spells` spec (#1756) has no class list, so it fetches every
// cantrip and narrows to its named options below; a `list` spec queries that
// class list server-side.
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
  // #1631: the chosen subclass's own catalog id (e.g. a 2014 Warlock's
  // patron, picked at creation since its subclassLevel is 1) — widens the
  // server-served pool with that subclass's list-expansion. Empty/absent for
  // a class with no subclass choice yet (subclassLevel > 1) or a non-caster.
  subclassId?: string;
  // Undefined for a non-caster class (no level-1 picks) — a High Elf Fighter
  // still reaches this step, for its species cantrip alone.
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
