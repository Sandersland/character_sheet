/**
 * One castable-spell row (#1163): name + school ink + the plain-language
 * "what happens" line, Attack/Cast on the right. The info dot (or the row
 * body) opens the big spell card for the full description + slot picker —
 * level and slot selection live there, not echoed per row (#1163). Once this
 * spell settles a cast this sheet-open, the row swaps to a quiet dimmed
 * receipt (#1164) instead of its normal controls.
 */

import { formatModifier } from "@/lib/abilities";
import { schoolInk } from "@/lib/spellFlavor";
import { schoolLabel, slotOrdinal } from "@/lib/spellMeta";
import type { ExpectedRoll } from "@/lib/spellPickerView";
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
  onOpenDetail: () => void;
  /** Set once this spell settles a cast this sheet-open (#1164) — swaps to CastRow. */
  justCastLevel?: number;
}

function InfoDot({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-label={`${label} details`}
      onClick={onOpen}
      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-parchment-300 text-[11px] font-bold text-parchment-500 transition-colors hover:bg-parchment-100"
    >
      i
    </button>
  );
}

/** The cast sheet's "what happens" line (#1163): plain text + a tinted dice pill. */
function ExpectedLine({ expected }: { expected: ExpectedRoll }) {
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-parchment-600">
      <span>{expected.lead}</span>
      {expected.dice && (
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${expected.diceTint}`}>
          {expected.dice}
        </span>
      )}
      {expected.tail && <span>{expected.tail}</span>}
    </p>
  );
}

/** Post-cast receipt (#1164): the row dims with a ✓ tick instead of its controls. */
function CastRow({ spell, level }: { spell: Spell; level: number }) {
  return (
    <div className="flex items-center gap-2.5 py-3 opacity-60 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-parchment-200">
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-vitality-500 text-vitality-700"
      >
        ✓
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-parchment-900">{spell.name}</span>
        <p className="text-xs text-parchment-600">
          {level > 0 ? `cast at ${slotOrdinal(level)} level · slot spent` : "cast"}
        </p>
      </div>
    </div>
  );
}

/** Bottom-right column: the attack two-step, then Cast. */
function SpellRowCastButtons({
  view,
  casting,
  onCast,
  onAttackRoll,
}: {
  view: SpellRowView;
  casting: boolean;
  onCast: () => void;
  onAttackRoll: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
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
        {casting ? "Casting…" : "Cast"}
      </button>
    </div>
  );
}

export default function SpellPickerRow({
  spell,
  view,
  row,
  onPatch,
  onCast,
  onAttackRoll,
  onOpenDetail,
  justCastLevel,
}: SpellPickerRowProps) {
  if (justCastLevel !== undefined) return <CastRow spell={spell} level={justCastLevel} />;

  return (
    <div className="flex flex-col gap-1 py-3 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-parchment-200">
      <div className="flex items-start gap-2.5">
        <InfoDot label={spell.name} onOpen={onOpenDetail} />

        <button type="button" onClick={onOpenDetail} className="min-w-0 flex-1 text-left">
          <span className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-medium text-parchment-900">{spell.name}</span>
            <span className={`text-[11px] font-semibold uppercase tracking-wide ${schoolInk(spell.school)}`}>
              {schoolLabel(spell.school)}
            </span>
          </span>
          <ExpectedLine expected={view.expected} />
        </button>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
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

          <SpellRowCastButtons view={view} casting={row.casting} onCast={onCast} onAttackRoll={onAttackRoll} />
        </div>
      </div>

      {row.error && <p className="text-xs font-semibold text-garnet-700">{row.error}</p>}
    </div>
  );
}
