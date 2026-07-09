// A single catalog result row with its Learn button.
import { catalogEffectLine, catalogMetaLine } from "@/lib/addSpell";
import type { CatalogSpell } from "@/types/character";

interface SpellCatalogRowProps {
  spell: CatalogSpell;
  alreadyKnown: boolean;
  busy: boolean;
  onLearn: (spell: CatalogSpell) => void;
}

export default function SpellCatalogRow({ spell, alreadyKnown, busy, onLearn }: SpellCatalogRowProps) {
  const effectLine = catalogEffectLine(spell);
  return (
    <li className="flex items-center justify-between gap-3 border-b border-arcane-100 py-2 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-parchment-900">{spell.name}</p>
        <p className="text-xs text-parchment-600">{catalogMetaLine(spell)}</p>
        {effectLine && <p className="text-xs text-arcane-700">{effectLine}</p>}
      </div>
      <button
        type="button"
        disabled={busy || alreadyKnown}
        onClick={() => onLearn(spell)}
        className="shrink-0 rounded bg-arcane-700 px-2.5 py-1 text-xs font-semibold text-parchment-50 hover:bg-arcane-800 disabled:cursor-not-allowed disabled:opacity-40"
        title={alreadyKnown ? "Already in your spellbook" : `Learn ${spell.name}`}
      >
        {alreadyKnown ? "Known" : "Learn"}
      </button>
    </li>
  );
}
