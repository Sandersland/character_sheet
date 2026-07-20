// The guided Spells step (#1160): a level-1 caster learns its starting cantrips +
// level-1 spells through the shared SpellPicker. Pick counts ride in from the
// reference payload (never re-encoded); eligibility + the cap live in
// lib/creationSpells. This step owns the catalog fetch and the draft patches.
import Spinner from "@/components/ui/Spinner";
import SpellPicker, { type SpellPickerGroup } from "@/features/spells/SpellPicker";
import { useSpellCatalog } from "@/features/spells/useSpellCatalog";
import {
  eligibleCreationCantrips,
  eligibleCreationSpells,
  toggleCreationPick,
  type CreationSpellCounts,
} from "@/lib/creationSpells";
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
  const { catalog, error, showSpinner } = useSpellCatalog();

  const groups: SpellPickerGroup[] = [];
  if (counts.cantrips > 0) {
    groups.push({
      key: "cantrips",
      label: "Cantrips",
      options: eligibleCreationCantrips(catalog, className),
      selectedIds: cantripIds,
      cap: counts.cantrips,
      onToggle: (id) => onChange({ cantripIds: toggleCreationPick(cantripIds, id, counts.cantrips) }),
    });
  }
  if (counts.spells > 0) {
    groups.push({
      key: "spells",
      label: "Spells",
      options: eligibleCreationSpells(catalog, className),
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
