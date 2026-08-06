// The guided Spells step (#1160): a level-1 caster learns its starting cantrips +
// level-1 spells through the shared SpellPicker. Every number rides in from the
// reference payload, and since #1377 eligibility is applied by the server — this
// step asks for the class's legal band and splits the answer into two groups.
import Spinner from "@/components/ui/Spinner";
import SpellPicker, { type SpellPickerGroup } from "@/features/spells/SpellPicker";
import { useSpellCatalog } from "@/features/spells/useSpellCatalog";
import {
  creationLeveledPickCap,
  splitCreationCatalog,
  toggleCreationPick,
  type CreationSpellCounts,
} from "@/lib/creationSpells";
import type { CharacterDraft } from "@/hooks/useCharacterDraft";
import type { RulesEdition } from "@character-sheet/shared-types";

// #1513: shown only for the Wizard (counts.spellbookSize present) — the
// prepared number is deliberately unstated: it's ability-score-dependent
// (2014's INT-mod formula) and not on ClassOption, so the sheet is the source
// of truth for it after creation.
function spellbookNote(spellbookSize: number): string {
  return `All ${spellbookSize} spells you choose are scribed into your spellbook, but only some can be prepared for casting at a time. After creation, your sheet marks which are prepared — you can swap them when you rest.`;
}

// Builds the two SpellPicker groups (cantrips, then leveled spells) from the
// served counts + already-split catalog. Split out of the component so its
// branching doesn't count against the component's own complexity gate; the
// #1513 spellbook relabel/note only touches the leveled-spells branch.
function buildSpellGroups(
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

export default function CreationSpellsStep({
  className,
  subclassId,
  counts,
  cantripIds,
  spellIds,
  edition,
  onChange,
}: {
  className: string;
  // #1631: the chosen subclass's own catalog id (e.g. a 2014 Warlock's
  // patron, picked at creation since its subclassLevel is 1) — widens the
  // server-served pool with that subclass's list-expansion. Empty/absent for
  // a class with no subclass choice yet (subclassLevel > 1) or a non-caster.
  subclassId?: string;
  counts: CreationSpellCounts;
  cantripIds: string[];
  spellIds: string[];
  edition: RulesEdition;
  onChange: (patch: Partial<CharacterDraft>) => void;
}) {
  const { catalog, error, showSpinner } = useSpellCatalog(edition, { className, maxLevel: counts.maxSpellLevel, subclassId });

  const options = splitCreationCatalog(catalog);
  const groups = buildSpellGroups(counts, options, cantripIds, spellIds, onChange);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0">
        <h2 className="font-display text-xl font-semibold text-parchment-900">Learn your magic</h2>
        <p className="mt-1 text-sm text-parchment-600">
          Choose the cantrips and level-1 spells your character starts knowing.
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
