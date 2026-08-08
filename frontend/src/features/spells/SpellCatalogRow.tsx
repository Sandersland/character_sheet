// A single catalog result row with its Learn button. `onFork` (#1801, epic
// #1795 6/6) is optional so every OTHER SpellCatalogRow caller (level-up,
// creation — none of them today) stays unaffected; only AddSpellPanel's own
// catalog tab wires it up.
import Badge from "@/components/ui/Badge";
import { catalogEffectLine, catalogMetaLine } from "@/lib/addSpell";
import { isForkable, isForkedSpell, scopeBadgeLabel } from "@/lib/catalogProvenance";
import type { CatalogSpell } from "@/types/character";

interface SpellCatalogRowProps {
  spell: CatalogSpell;
  alreadyKnown: boolean;
  busy: boolean;
  onLearn: (spell: CatalogSpell) => void;
  onFork?: (spell: CatalogSpell) => void;
}

export default function SpellCatalogRow({ spell, alreadyKnown, busy, onLearn, onFork }: SpellCatalogRowProps) {
  const effectLine = catalogEffectLine(spell);
  const scopeBadge = scopeBadgeLabel(spell);
  const showFork = onFork !== undefined && isForkable(spell);
  return (
    <li className="flex items-center justify-between gap-3 border-b border-arcane-100 py-2 last:border-0">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5 truncate text-sm font-medium text-parchment-900">
          {spell.name}
          {scopeBadge && <Badge tone="gold">{scopeBadge}</Badge>}
          {isForkedSpell(spell) && <Badge tone="arcane">Forked</Badge>}
        </p>
        <p className="text-xs text-parchment-600">{catalogMetaLine(spell)}</p>
        {effectLine && <p className="text-xs text-arcane-700">{effectLine}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {showFork && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onFork(spell)}
            aria-label={`Fork ${spell.name}`}
            title="Make your own editable copy"
            className="rounded border border-arcane-700 px-2.5 py-1 text-xs font-semibold text-arcane-700 hover:bg-arcane-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Fork
          </button>
        )}
        <button
          type="button"
          disabled={busy || alreadyKnown}
          onClick={() => onLearn(spell)}
          className="rounded bg-arcane-700 px-2.5 py-1 text-xs font-semibold text-parchment-50 hover:bg-arcane-800 disabled:cursor-not-allowed disabled:opacity-40"
          title={alreadyKnown ? "Already in your spellbook" : `Learn ${spell.name}`}
        >
          {alreadyKnown ? "Known" : "Learn"}
        </button>
      </div>
    </li>
  );
}
