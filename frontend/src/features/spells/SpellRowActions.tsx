// Rune prepare-toggle + Cast / Remove controls for a spellbook row.
import { canPrepare, type PreparedBudget } from "@/lib/spellList";
import { runeState, type SpellRowDerived } from "@/lib/spellRow";
import type { Spell } from "@/types/character";

interface SpellRowActionsProps {
  spell: Spell;
  derived: SpellRowDerived;
  budget: PreparedBudget;
  busy: boolean;
  onPrepare: (spell: Spell) => void;
  onForget: (spell: Spell) => void;
  onCastClick: () => void;
}

function PrepareRune({ spell, budget, busy, onPrepare }: Pick<SpellRowActionsProps, "spell" | "budget" | "busy" | "onPrepare">) {
  const state = runeState(spell);
  if (state === "locked") {
    return (
      <span
        aria-label="Always prepared"
        title="Always prepared"
        className="h-5 w-5 shrink-0 rounded-full border border-arcane-600 bg-arcane-500"
      />
    );
  }
  // Kept clickable at the cap so the tap surfaces the reason (handler pre-blocks).
  const blocked = state === "unprepared" && !canPrepare(spell, budget);
  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={state === "prepared"}
      onClick={() => onPrepare(spell)}
      aria-label={state === "prepared" ? `Unprepare ${spell.name}` : `Prepare ${spell.name}`}
      title={
        state === "prepared"
          ? "Mark as unprepared"
          : blocked
            ? `Prepared limit reached (${budget.limit})`
            : "Mark as prepared"
      }
      className={`h-5 w-5 shrink-0 rounded-full border transition-colors disabled:opacity-40 ${
        state === "prepared"
          ? "border-garnet-700 bg-garnet-600 ring-2 ring-garnet-50"
          : `border-parchment-400 bg-parchment-50 hover:border-garnet-500 ${blocked ? "opacity-50" : ""}`
      }`}
    />
  );
}

export default function SpellRowActions({
  spell, derived, budget, busy, onPrepare, onForget, onCastClick,
}: SpellRowActionsProps) {
  const { item, itemExhausted, isCantrip, isGranted } = derived;
  return (
    <div className="flex shrink-0 items-center gap-2">
      <PrepareRune spell={spell} budget={budget} busy={busy} onPrepare={onPrepare} />

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
