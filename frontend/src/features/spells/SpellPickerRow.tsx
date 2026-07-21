// One quiet spell row for the shared picker (#1160): the row body opens the big
// SpellDetailCard; a tri-state pill on the right toggles the pick directly. The
// two are siblings (never nested buttons) so both stay valid, keyboard-reachable
// controls.
import { damagePillClass, schoolInk, schoolRibbon } from "@/lib/spellFlavor";
import { schoolLabel } from "@/lib/spellMeta";
import { effectPillLabel, pickerMetaLine, type SpellPickRowState } from "@/lib/spellPickerView";
import type { CatalogSpell } from "@/types/character";

const PILL_TEXT: Record<Exclude<SpellPickRowState, "known">, string> = { selected: "✓ Added", select: "Add" };

function SmallBadge({ className, children }: { className: string; children: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}>{children}</span>;
}

export default function SpellPickerRow({
  spell,
  state,
  disabled,
  onToggle,
  onOpen,
}: {
  spell: CatalogSpell;
  state: SpellPickRowState;
  disabled: boolean;
  onToggle: (spellId: string) => void;
  onOpen: () => void;
}) {
  const effect = effectPillLabel(spell);
  const effectTint = spell.effectKind === "heal" ? "bg-vitality-100 text-vitality-800" : damagePillClass(spell.damageType);
  return (
    <li className="rounded-control border border-parchment-200 bg-parchment-50">
      <div className="flex items-start justify-between gap-3 p-3">
        <button
          type="button"
          aria-label={`Open ${spell.name}`}
          onClick={() => onOpen()}
          className="min-w-0 flex-1 text-left"
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className={`font-semibold ${schoolInk(spell.school)}`}>{spell.name}</span>
            <SmallBadge className={schoolRibbon(spell.school)}>{schoolLabel(spell.school)}</SmallBadge>
            {spell.concentration && <SmallBadge className="bg-gold-100 text-gold-800">Conc</SmallBadge>}
            {spell.ritual && <SmallBadge className="bg-parchment-100 text-parchment-600">Ritual</SmallBadge>}
          </span>
          <span className="mt-0.5 block text-xs text-parchment-500">{pickerMetaLine(spell)}</span>
          {effect && (
            <span className={`mt-1.5 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${effectTint}`}>
              {effect}
            </span>
          )}
        </button>
        {state === "known" ? (
          <button
            type="button"
            disabled
            aria-label={`${spell.name} already known`}
            className="shrink-0 rounded-full border border-parchment-300 bg-parchment-100 px-3 py-1.5 text-xs font-semibold text-parchment-500"
          >
            Known
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled}
            aria-pressed={state === "selected"}
            aria-label={`Add ${spell.name}`}
            onClick={() => onToggle(spell.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
              state === "selected"
                ? "border-garnet-700 bg-garnet-700 text-parchment-50"
                : "border-garnet-700 bg-parchment-50 text-garnet-700"
            }`}
          >
            {PILL_TEXT[state]}
          </button>
        )}
      </div>
    </li>
  );
}
