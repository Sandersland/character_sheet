// Prepare / Cast / Remove controls for a spellbook row.
import type { SpellRowDerived } from "@/lib/spellRow";
import type { Spell } from "@/types/character";

interface SpellRowActionsProps {
  spell: Spell;
  derived: SpellRowDerived;
  busy: boolean;
  onPrepare: (spell: Spell) => void;
  onForget: (spell: Spell) => void;
  onCastClick: () => void;
}

export default function SpellRowActions({
  spell, derived, busy, onPrepare, onForget, onCastClick,
}: SpellRowActionsProps) {
  const { isCantrip, item, itemExhausted, isGranted } = derived;
  return (
    <div className="flex shrink-0 items-center gap-2">
      {!isCantrip && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onPrepare(spell)}
          className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
            spell.prepared
              ? "bg-arcane-100 text-arcane-800 hover:bg-arcane-200"
              : "bg-parchment-100 text-parchment-600 hover:bg-parchment-200"
          }`}
          title={spell.prepared ? "Mark as unprepared" : "Mark as prepared"}
        >
          {spell.prepared ? "prepared" : "unprepared"}
        </button>
      )}

      <button
        type="button"
        disabled={busy || itemExhausted}
        onClick={onCastClick}
        className="rounded bg-garnet-600 px-2.5 py-0.5 text-xs font-semibold text-parchment-50 hover:bg-garnet-700 disabled:opacity-40"
        title={item ? `Cast ${spell.name} from ${item.itemName}` : isCantrip ? `Cast ${spell.name}` : `Cast ${spell.name} (choose slot)`}
      >
        Cast
      </button>

      {!isGranted && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onForget(spell)}
          className="text-parchment-600 hover:text-garnet-600 disabled:opacity-40"
          title={`Remove ${spell.name} from spellbook`}
          aria-label={`Remove ${spell.name}`}
        >
          ✕
        </button>
      )}
    </div>
  );
}
