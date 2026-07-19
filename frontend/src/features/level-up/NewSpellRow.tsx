// One eligible-spell row for the New Spells step (#890). The whole row is the
// toggle; a known spell is disabled, a picked one is pressed, and an unpicked one
// disables once the cap is hit. Arcane-teal styling matches SpellCatalogRow.
import { catalogEffectLine, catalogMetaLine } from "@/lib/addSpell";
import type { CatalogSpell } from "@/types/character";

export type NewSpellRowState = "known" | "selected" | "select";

const BADGE: Record<NewSpellRowState, string> = { known: "Known", selected: "✓ Added", select: "Add" };

export default function NewSpellRow({
  spell,
  state,
  disabled,
  onToggle,
}: {
  spell: CatalogSpell;
  state: NewSpellRowState;
  disabled: boolean;
  onToggle: (spellId: string) => void;
}) {
  const effectLine = catalogEffectLine(spell);
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={state === "selected"}
        onClick={() => onToggle(spell.id)}
        className={`flex w-full items-center justify-between gap-3 border-b border-arcane-100 py-2 text-left last:border-0 disabled:cursor-not-allowed ${
          state === "selected" ? "text-arcane-900" : "text-parchment-900"
        } ${state === "known" ? "opacity-50" : ""}`}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{spell.name}</span>
          <span className="block text-xs text-parchment-600">{catalogMetaLine(spell)}</span>
          {effectLine && <span className="block text-xs text-arcane-700">{effectLine}</span>}
        </span>
        <span
          className={`shrink-0 rounded px-2.5 py-1 text-xs font-semibold ${
            state === "selected"
              ? "bg-arcane-700 text-parchment-50"
              : state === "known"
                ? "text-parchment-500"
                : "border border-arcane-300 text-arcane-800"
          }`}
        >
          {BADGE[state]}
        </span>
      </button>
    </li>
  );
}
