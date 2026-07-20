// The "big spell card" for the shared spell picker (#1160): the full description,
// a stat grid, and a what-to-expect line, presented in the responsive BottomSheet
// (mobile sheet / desktop dialog) with a single Learn CTA. The spell prop is a
// structural SpellDetailView so both CatalogSpell and the sheet's Spell satisfy it.
import BottomSheet from "@/components/ui/BottomSheet";
import { abilityAbbr } from "@/lib/abilities";
import { damagePillClass, schoolRibbon } from "@/lib/spellFlavor";
import { levelLabel, schoolLabel, upcastHint } from "@/lib/spellMeta";
import { componentsLine, effectPillLabel } from "@/lib/spellPickerView";
import type { SpellComponents, SpellSchool } from "@/types/character";

export interface SpellDetailView {
  name: string;
  level: number;
  school: SpellSchool;
  castingTime: string;
  range: string;
  duration: string;
  description: string;
  concentration?: boolean;
  ritual?: boolean;
  components?: SpellComponents | null;
  attackType?: "attack" | "save" | null;
  saveAbility?: string | null;
  saveEffect?: "half" | "none" | null;
  effectKind?: "damage" | "heal" | "buff" | null;
  effectDiceCount?: number | null;
  effectDiceFaces?: number | null;
  effectModifier?: number | null;
  damageType?: string | null;
  upcastDicePerLevel?: number | null;
}

interface CtaSlot {
  label: string;
  disabled: boolean;
  onPress: () => void;
}

const CELL_LABEL = "text-[11px] font-semibold uppercase tracking-wide text-parchment-500";

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-parchment-50 px-3 py-2">
      <div className={CELL_LABEL}>{label}</div>
      <div className="text-sm font-medium text-parchment-900">{value}</div>
    </div>
  );
}

// The what-to-expect line: the effect (damage/heal) tinted to its type, plus the
// save-vs-attack resolution — the same detail the in-session cast surface shows.
function ExpectChips({ spell }: { spell: SpellDetailView }) {
  const effect = effectPillLabel(spell);
  const effectTint = spell.effectKind === "heal" ? "bg-vitality-100 text-vitality-800" : damagePillClass(spell.damageType);
  const resolution =
    spell.attackType === "save" && spell.saveAbility
      ? `${abilityAbbr(spell.saveAbility)} save${spell.saveEffect === "half" ? " · half on success" : ""}`
      : spell.attackType === "attack"
        ? "Spell attack"
        : null;
  if (!effect && !resolution) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span aria-hidden="true" className="text-arcane-700">✦</span>
      {effect && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${effectTint}`}>{effect}</span>}
      {resolution && (
        <span className="rounded-full bg-arcane-50 px-2.5 py-1 text-xs font-semibold text-arcane-800">{resolution}</span>
      )}
    </div>
  );
}

export default function SpellDetailCard({
  spell,
  cta,
  onClose,
}: {
  spell: SpellDetailView;
  cta: CtaSlot;
  onClose: () => void;
}) {
  const upcast = upcastHint(spell);
  return (
    <BottomSheet title={spell.name} onClose={onClose}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${schoolRibbon(spell.school)}`}>
          {schoolLabel(spell.school)}
        </span>
        {spell.concentration && (
          <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-semibold text-gold-800">Conc</span>
        )}
        {spell.ritual && (
          <span className="rounded-full bg-parchment-100 px-2 py-0.5 text-[11px] font-semibold text-parchment-600">
            Ritual
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-parchment-500">{levelLabel(spell.level)}</p>

      <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-control border border-parchment-200 bg-parchment-200">
        <StatCell label="Casting time" value={spell.castingTime} />
        <StatCell label="Range" value={spell.range} />
        <StatCell label="Components" value={componentsLine(spell) ?? "—"} />
        <StatCell label="Duration" value={spell.duration} />
      </div>

      <ExpectChips spell={spell} />

      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-parchment-700">{spell.description}</p>
      {upcast && <p className="mt-2 text-xs text-arcane-700">{upcast}</p>}

      <div className="sticky bottom-0 mt-4 -mx-4 border-t border-parchment-200 bg-parchment-50 px-4 pb-1 pt-3">
        <button
          type="button"
          disabled={cta.disabled}
          onClick={cta.onPress}
          className="w-full rounded-control bg-garnet-700 py-3 text-center text-sm font-semibold text-parchment-50 hover:bg-garnet-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cta.label}
        </button>
      </div>
    </BottomSheet>
  );
}
