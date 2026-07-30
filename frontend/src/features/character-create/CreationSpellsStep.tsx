// The guided Spells step (#1160): a level-1 caster learns its starting cantrips +
// level-1 spells through the shared SpellPicker. Every number rides in from the
// reference payload, and since #1377 eligibility is applied by the server — this
// step asks for the class's legal band and splits the answer into two groups.
import Spinner from "@/components/ui/Spinner";
import SpellPicker, { type SpellPickerGroup } from "@/features/spells/SpellPicker";
import { useSpellCatalog } from "@/features/spells/useSpellCatalog";
import { splitCreationCatalog, toggleCreationPick, type CreationSpellCounts } from "@/lib/creationSpells";
import type { CharacterDraft } from "@/hooks/useCharacterDraft";

export default function CreationSpellsStep({
  className,
  counts,
  cantripIds,
  spellIds,
  onChange,
}: {
  className: string;
  counts: CreationSpellCounts;
  cantripIds: string[];
  spellIds: string[];
  onChange: (patch: Partial<CharacterDraft>) => void;
}) {
  const { catalog, error, showSpinner } = useSpellCatalog({ className, maxLevel: counts.maxSpellLevel });

  const options = splitCreationCatalog(catalog);

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
    groups.push({
      key: "spells",
      label: "Spells",
      options: options.spells,
      selectedIds: spellIds,
      cap: counts.spells,
      onToggle: (id) => onChange({ spellIds: toggleCreationPick(spellIds, id, counts.spells) }),
    });
  }

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
