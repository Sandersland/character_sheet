// Quick-cast list inside the spellcasting block: at-will cantrips + prepared
// leveled spells, each with a Cast affordance that reuses SpellsSection's cast flow.
import { derivePreparedCastable } from "@/lib/preparedSpells";
import type { Character, Spell } from "@/types/character";

interface PreparedSpellListProps {
  spellcasting: NonNullable<Character["spellcasting"]>;
  busy: boolean;
  onCast: (spell: Spell) => void;
}

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
function ordinal(n: number) {
  return ORDINALS[n] ?? `${n}th`;
}

function SpellRow({
  spell,
  cantrip,
  busy,
  onCast,
}: {
  spell: Spell;
  cantrip: boolean;
  busy: boolean;
  onCast: (spell: Spell) => void;
}) {
  const tag = cantrip ? spell.range : `${ordinal(spell.level)} · ${spell.range}`;
  return (
    <div className="flex items-center gap-2.5 border-b border-dotted border-parchment-300 py-1.5 last:border-b-0">
      <span
        aria-hidden="true"
        className={`h-3 w-3 shrink-0 rounded-full ${cantrip ? "bg-arcane-500 ring-2 ring-arcane-100" : "bg-garnet-600 ring-2 ring-garnet-50"}`}
      />
      <span className="font-medium text-parchment-900">{spell.name}</span>
      <span className="text-[10px] uppercase tracking-wide text-parchment-500">{tag}</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => onCast(spell)}
        aria-label={`Cast ${spell.name}`}
        className="ml-auto rounded-full border border-arcane-200 bg-arcane-50 px-2.5 py-0.5 text-[11px] font-semibold text-arcane-800 hover:bg-arcane-100 disabled:opacity-40"
      >
        Cast
      </button>
    </div>
  );
}

function Group({
  heading,
  spells,
  cantrip,
  busy,
  onCast,
}: {
  heading: string;
  spells: Spell[];
  cantrip: boolean;
  busy: boolean;
  onCast: (spell: Spell) => void;
}) {
  if (spells.length === 0) return null;
  return (
    <div>
      <p className="mb-1 mt-2 text-[10px] font-bold uppercase tracking-wide text-parchment-500">
        {heading}
      </p>
      {spells.map((spell) => (
        <SpellRow key={spell.id} spell={spell} cantrip={cantrip} busy={busy} onCast={onCast} />
      ))}
    </div>
  );
}

export default function PreparedSpellList({ spellcasting, busy, onCast }: PreparedSpellListProps) {
  const { cantrips, prepared } = derivePreparedCastable(spellcasting);
  if (cantrips.length === 0 && prepared.length === 0) return null;
  return (
    <div className="text-sm">
      <Group heading="Cantrips · at will" spells={cantrips} cantrip busy={busy} onCast={onCast} />
      <Group heading="Prepared · leveled" spells={prepared} cantrip={false} busy={busy} onCast={onCast} />
    </div>
  );
}
