/** One castable-spell row: metadata, slot/target controls, and Attack/Cast buttons. */

import { formatModifier } from "@/lib/abilities";
import { levelLabel } from "@/lib/spellMeta";
import Badge from "@/components/ui/Badge";
import SlotLevelSelector from "@/features/session/SlotLevelSelector";
import SpellTargetToggle from "@/features/session/SpellTargetToggle";
import type { SpellRowState, SpellRowView } from "@/features/session/useSpellPicker";
import type { Spell } from "@/types/character";

interface SpellPickerRowProps {
  spell: Spell;
  view: SpellRowView;
  row: SpellRowState;
  onPatch: (patch: Partial<SpellRowState>) => void;
  onCast: () => void;
  onAttackRoll: () => void;
}

export default function SpellPickerRow({ spell, view, row, onPatch, onCast, onAttackRoll }: SpellPickerRowProps) {
  const castLabel = row.casting
    ? "Casting…"
    : view.isCantrip
      ? "Cast"
      : view.usesArcanum
        ? "Cast (Arcanum)"
        : `Cast (L${view.spellSlot ?? spell.level})`;

  return (
    <div className="flex flex-col gap-1.5 py-3 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-parchment-200">
      {/* ── Row header: name + badges ── */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-medium text-parchment-900">{spell.name}</span>
            <div className="flex flex-wrap items-center gap-1">
              <Badge tone="neutral">{levelLabel(spell.level)}</Badge>
              <Badge tone={view.schoolTone}>{spell.school}</Badge>
              {spell.concentration && <Badge tone="arcane">conc</Badge>}
              {spell.ritual && <Badge tone="gold">ritual</Badge>}
              {view.usesArcanum && <Badge tone="gold">arcanum</Badge>}
            </div>
          </div>
          <p className="text-xs text-parchment-600">
            {spell.castingTime} · {spell.range}
          </p>
          {view.preview && <p className="text-xs text-parchment-600">{view.preview}</p>}
          {view.compStr && <p className="text-[11px] text-parchment-600">{view.compStr}</p>}
        </div>

        {/* ── Right: target toggle + slot picker + cast buttons ── */}
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {!view.isCantrip && (
            <SlotLevelSelector
              spell={spell}
              availableSlots={view.availableSlots}
              spellSlot={view.spellSlot}
              usesArcanum={view.usesArcanum}
              onSelect={(lvl) => onPatch({ slotLevel: lvl })}
            />
          )}

          {spell.effectKind && (
            <SpellTargetToggle
              target={row.target}
              locked={view.locked}
              disabled={row.casting}
              healing={view.isHeal}
              allies={view.allies}
              onSelect={(target) => onPatch({ target })}
            />
          )}

          {/* Attack / save info + cast button row */}
          <div className="flex items-center gap-2">
            {view.isSave && view.dcLabel && (
              <span className="rounded bg-arcane-50 px-2 py-0.5 text-[11px] font-semibold text-arcane-700">
                {view.dcLabel}
              </span>
            )}

            {view.isSave && spell.saveEffect === "half" && (
              <span className="text-[11px] text-parchment-600">½ on save</span>
            )}

            {view.isAttack && (
              <button
                type="button"
                disabled={view.attackDisabled}
                onClick={onAttackRoll}
                className="rounded-control border border-garnet-200 bg-garnet-50 px-2.5 py-1 text-xs font-semibold text-garnet-700 transition-colors hover:bg-garnet-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Attack {formatModifier(view.spellAttackBonus)}
              </button>
            )}

            <button
              type="button"
              disabled={view.castDisabled}
              onClick={onCast}
              className="rounded-control bg-arcane-700 px-2.5 py-1 text-xs font-semibold text-parchment-50 transition-colors hover:bg-arcane-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {castLabel}
            </button>
          </div>
        </div>
      </div>

      {row.error && <p className="text-xs font-semibold text-garnet-700">{row.error}</p>}
    </div>
  );
}
