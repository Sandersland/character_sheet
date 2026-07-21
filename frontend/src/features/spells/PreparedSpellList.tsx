// Read-only roster inside the spellcasting block: at-will cantrips + prepared
// leveled spells. View/manage only (#1162) — casting moved to the record's
// single "Cast a spell" door (CastSpellDoor); this list has no affordances.
import { derivePreparedCastable } from "@/lib/preparedSpells";
import { slotOrdinal } from "@/lib/spellMeta";
import type { Character, Spell } from "@/types/character";

interface PreparedSpellListProps {
  spellcasting: NonNullable<Character["spellcasting"]>;
}

function RosterRow({ spell, cantrip }: { spell: Spell; cantrip: boolean }) {
  const tag = cantrip ? spell.range : `${slotOrdinal(spell.level)} · ${spell.range}`;
  return (
    <div className="flex items-center gap-2.5 border-b border-dotted border-parchment-300 py-1.5 last:border-b-0">
      <span
        aria-hidden="true"
        className={`h-3 w-3 shrink-0 rounded-full ${cantrip ? "bg-arcane-500 ring-2 ring-arcane-100" : "bg-garnet-600 ring-2 ring-garnet-50"}`}
      />
      <span className="font-medium text-parchment-900">{spell.name}</span>
      <span className="ml-auto text-[10px] uppercase tracking-wide text-parchment-500">{tag}</span>
    </div>
  );
}

function Group({ heading, spells, cantrip }: { heading: string; spells: Spell[]; cantrip: boolean }) {
  if (spells.length === 0) return null;
  return (
    <div>
      <p className="mb-1 mt-2 text-[10px] font-bold uppercase tracking-wide text-parchment-500">
        {heading}
      </p>
      {spells.map((spell) => (
        <RosterRow key={spell.id} spell={spell} cantrip={cantrip} />
      ))}
    </div>
  );
}

export default function PreparedSpellList({ spellcasting }: PreparedSpellListProps) {
  const { cantrips, prepared } = derivePreparedCastable(spellcasting);
  if (cantrips.length === 0 && prepared.length === 0) return null;
  return (
    <div className="text-sm">
      <Group heading="Cantrips · at will" spells={cantrips} cantrip />
      <Group heading="Prepared · leveled" spells={prepared} cantrip={false} />
    </div>
  );
}
