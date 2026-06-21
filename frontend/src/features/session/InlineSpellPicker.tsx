/**
 * InlineSpellPicker — inline spell list for the TurnHub's spell resolution.
 *
 * Mirrors InlineAttackPicker.tsx in structure. For each prepared/known spell
 * that is castable right now (cantrip always; leveled spells need a remaining
 * slot ≥ spell level), the player can:
 *
 *   1. (leveled spells only) Choose a slot level via a dropdown — shows a live
 *      effect preview using computeCastRoll so the player sees the upcast delta
 *      before committing.
 *   2. Choose a target: "self" (HP is automatically adjusted) or "other"
 *      (roll is displayed for the DM / GM to apply). Default: "other" for
 *      damage, "self" for heal. Locked to "self" when range is "Self".
 *   3. For attack spells (attackType === "attack"): roll the spell attack via
 *      useRoll(), then cast with a separate Cast button.
 *      For save spells (attackType === "save"): display the save DC + ability;
 *      cast immediately with Cast (no to-hit roll).
 *      For utility spells (no attackType): cast directly.
 *   4. Cast → computeCastRoll for the effect total → applySpellcastingTransactions
 *      with optional apply:{target:"self",kind,amount} when targeting self →
 *      onUpdate(refreshed character). Panel stays open for multiple casts.
 *
 * Explicit "Done" button closes the panel (never auto-closes).
 *
 * For bonus-action spells (castingTime starts with "1 bonus action") the
 * TurnHub already consumed the bonus-action slot via the castSpellBonus resolver
 * before opening this panel. For reaction spells (castSpellReaction resolver)
 * the reaction slot is already consumed. Filtering by casting time is therefore
 * already done at the resolver / turnRules layer.
 */

import { useState } from "react";

import { useRoll } from "@/features/dice/RollContext";
import { formatModifier } from "@/lib/abilities";
import { applySpellcastingTransactions } from "@/api/client";
import { computeCastRoll } from "@/lib/spellCast";
import {
  SCHOOL_TONE,
  levelLabel,
  effectPreviewWithMod,
  componentsLabel,
  saveDcLabel,
} from "@/lib/spellMeta";
import Badge from "@/components/ui/Badge";
import type { Character, Spell } from "@/types/character";

// ── Types ─────────────────────────────────────────────────────────────────────

interface InlineSpellPickerProps {
  character: Character;
  onUpdate: (c: Character) => void;
  onClose: () => void;
  /**
   * Optional filter on casting time. When provided, only spells whose
   * castingTime starts with this prefix are shown (e.g. "1 action",
   * "1 bonus action", "1 reaction"). Omit to show all castable spells.
   */
  castingTimeFilter?: string;
}

type Target = "self" | "other";

interface SpellRowState {
  slotLevel: number | undefined;   // chosen slot level (undefined = not picked yet)
  target: Target;
  attackRolled: boolean;           // true after the attack-roll button is used
  attackTotal: number | null;      // the d20+bonus result
  castResult: { total: number; diceStr: string } | null;
  casting: boolean;
  error: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Default target: heal spells or "Self" range → self; everything else → other. */
function defaultTarget(spell: Spell): Target {
  if (spell.range?.toLowerCase() === "self") return "self";
  if (spell.effectKind === "heal") return "self";
  return "other";
}

/** True when the target is locked to "self" (range is exactly "Self"). */
function targetLocked(spell: Spell): boolean {
  return spell.range?.toLowerCase() === "self";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InlineSpellPicker({
  character,
  onUpdate,
  onClose,
  castingTimeFilter,
}: InlineSpellPickerProps) {
  const { roll } = useRoll();
  const spellcasting = character.spellcasting!;
  const { slots = [], spells = [], spellSaveDC, spellAttackBonus } = spellcasting;

  // Per-spell row state keyed by spell.id.
  const [rowStates, setRowStates] = useState<Record<string, SpellRowState>>({});

  function getRow(spellId: string, spell: Spell, resolvedSlot: number | undefined): SpellRowState {
    return rowStates[spellId] ?? {
      slotLevel: resolvedSlot,
      target: defaultTarget(spell),
      attackRolled: false,
      attackTotal: null,
      castResult: null,
      casting: false,
      error: null,
    };
  }

  function patchRow(spellId: string, patch: Partial<SpellRowState>) {
    setRowStates((prev) => ({
      ...prev,
      [spellId]: { ...getRow(spellId, {} as Spell, undefined), ...prev[spellId], ...patch },
    }));
  }

  // Available slot levels with remaining uses.
  const availableSlotLevels = slots
    .filter((s) => s.used < s.total)
    .map((s) => s.level)
    .sort((a, b) => a - b);

  // Castable spells: prepared (or cantrips), and — for leveled spells — there
  // must be at least one slot level ≥ spell.level remaining.
  const castableSpells = spells.filter((spell) => {
    if (!spell.prepared && spell.level > 0) return false;
    if (spell.level === 0) return true; // cantrips always available
    const hasSlotsAvailable = availableSlotLevels.some((l) => l >= spell.level);
    if (!hasSlotsAvailable) return false;
    // Filter by casting time if requested.
    if (castingTimeFilter) {
      return spell.castingTime?.toLowerCase().startsWith(castingTimeFilter.toLowerCase());
    }
    return true;
  });

  // Sort: cantrips first, then ascending level, then alphabetically.
  const sortedSpells = [...castableSpells].sort(
    (a, b) => a.level - b.level || a.name.localeCompare(b.name),
  );

  // ── Slot picker helpers ──────────────────────────────────────────────────────

  /** Available slot levels for a given leveled spell. */
  function availableSlotsForSpell(spell: Spell): number[] {
    if (spell.level === 0) return [];
    return availableSlotLevels.filter((l) => l >= spell.level);
  }

  /** Resolved slot level for a spell: the row's chosen level, or the lowest available. */
  function resolvedSlot(spell: Spell, row: SpellRowState): number | undefined {
    if (spell.level === 0) return undefined;
    if (row.slotLevel !== undefined) return row.slotLevel;
    const slots = availableSlotsForSpell(spell);
    return slots[0];
  }

  // ── Cast handler ─────────────────────────────────────────────────────────────

  async function handleCast(spell: Spell) {
    const row = rowStates[spell.id] ?? { ...getRow(spell.id, spell, undefined), slotLevel: availableSlotsForSpell(spell)[0] };
    const slot = resolvedSlot(spell, row);
    const isCantrip = spell.level === 0;

    patchRow(spell.id, { casting: true, error: null, castResult: null });

    // Compute the effect roll (pure, client-side).
    const castRoll = computeCastRoll(spell, character, slot ?? spell.level);
    const rollTotal = castRoll?.total ?? 0;
    const diceStr = castRoll ? `${castRoll.spec.count}d${castRoll.spec.faces}` : "";

    // Build the op.
    const applyPayload =
      row.target === "self" && castRoll && spell.effectKind
        ? { target: "self" as const, kind: spell.effectKind as "heal" | "damage", amount: rollTotal }
        : undefined;

    const op = isCantrip
      ? { type: "castSpell" as const, entryId: spell.id, roll: rollTotal, apply: applyPayload }
      : { type: "castSpell" as const, entryId: spell.id, slotLevel: slot!, roll: rollTotal, apply: applyPayload };

    try {
      const updated = await applySpellcastingTransactions(character.id, [op]);
      onUpdate(updated);
      patchRow(spell.id, {
        casting: false,
        attackRolled: false,
        attackTotal: null,
        castResult: castRoll ? { total: rollTotal, diceStr } : null,
      });
    } catch (err) {
      patchRow(spell.id, {
        casting: false,
        error: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (castableSpells.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-parchment-500">
          {availableSlotLevels.length === 0
            ? "No spell slots remaining."
            : "No prepared spells available to cast right now."}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="self-start rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-700 hover:bg-parchment-100"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-parchment-200">
      {sortedSpells.map((spell) => {
        const isCantrip = spell.level === 0;
        const schoolTone = SCHOOL_TONE[spell.school as keyof typeof SCHOOL_TONE] ?? "neutral";
        const availableSlots = availableSlotsForSpell(spell);
        const initRow = getRow(spell.id, spell, availableSlots[0]);
        const row = rowStates[spell.id] ?? initRow;
        const slot = resolvedSlot(spell, row);
        const locked = targetLocked(spell);
        const preview = effectPreviewWithMod(spell, character, slot);
        const compStr = componentsLabel(spell);
        const isAttack = spell.attackType === "attack";
        const isSave = spell.attackType === "save";
        const dcLabel = isSave ? saveDcLabel(spell, spellSaveDC ?? 0) : null;
        const canCast = isAttack ? row.attackRolled : true;

        return (
          <div key={spell.id} className="flex flex-col gap-1.5 py-3">
            {/* ── Row header: name + badges ── */}
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium text-parchment-900">{spell.name}</span>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge tone="neutral">{levelLabel(spell.level)}</Badge>
                    <Badge tone={schoolTone}>{spell.school}</Badge>
                    {spell.concentration && <Badge tone="arcane">conc</Badge>}
                    {spell.ritual && <Badge tone="gold">ritual</Badge>}
                  </div>
                </div>
                <p className="text-xs text-parchment-500">
                  {spell.castingTime} · {spell.range}
                </p>
                {preview && (
                  <p className="text-xs text-parchment-600">{preview}</p>
                )}
                {compStr && (
                  <p className="text-[11px] text-parchment-400">{compStr}</p>
                )}
              </div>

              {/* ── Right: target toggle + cast buttons ── */}
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {/* Slot / upcast selector (leveled only) */}
                {!isCantrip && availableSlots.length > 1 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-parchment-500">Slot:</span>
                    {availableSlots.map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => patchRow(spell.id, { slotLevel: lvl, castResult: null, attackRolled: false, attackTotal: null })}
                        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors ${
                          slot === lvl
                            ? "bg-arcane-600 text-white"
                            : "bg-arcane-100 text-arcane-800 hover:bg-arcane-200"
                        }`}
                      >
                        L{lvl}
                        {lvl !== spell.level && <span className="ml-0.5 opacity-60">↑</span>}
                      </button>
                    ))}
                  </div>
                )}

                {/* Target toggle */}
                {spell.effectKind && (
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-parchment-500">Target:</span>
                    <button
                      type="button"
                      disabled={locked || row.casting}
                      onClick={() => patchRow(spell.id, { target: "self" })}
                      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                        row.target === "self"
                          ? "bg-vitality-600 text-white"
                          : "bg-parchment-100 text-parchment-600 hover:bg-parchment-200"
                      }`}
                    >
                      self
                    </button>
                    <button
                      type="button"
                      disabled={locked || row.casting}
                      onClick={() => patchRow(spell.id, { target: "other" })}
                      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                        row.target === "other"
                          ? "bg-garnet-600 text-white"
                          : "bg-parchment-100 text-parchment-600 hover:bg-parchment-200"
                      }`}
                    >
                      other
                    </button>
                  </div>
                )}

                {/* Attack / save info + cast button row */}
                <div className="flex items-center gap-2">
                  {/* Save DC badge for save spells */}
                  {isSave && dcLabel && (
                    <span className="rounded bg-arcane-50 px-2 py-0.5 text-[11px] font-semibold text-arcane-700">
                      {dcLabel}
                    </span>
                  )}

                  {/* Save-half hint */}
                  {isSave && spell.saveEffect === "half" && (
                    <span className="text-[11px] text-parchment-400">½ on save</span>
                  )}

                  {/* Attack roll button (attack spells) */}
                  {isAttack && !row.attackRolled && (
                    <button
                      type="button"
                      disabled={row.casting}
                      onClick={() => {
                        const result = roll(
                          { count: 1, faces: 20, modifier: spellAttackBonus ?? 0 },
                          `${spell.name} spell attack`,
                        );
                        patchRow(spell.id, { attackRolled: true, attackTotal: result.total, castResult: null });
                      }}
                      className="rounded-control border border-garnet-200 bg-garnet-50 px-2.5 py-1 text-xs font-semibold text-garnet-700 transition-colors hover:bg-garnet-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Attack {formatModifier(spellAttackBonus ?? 0)}
                    </button>
                  )}

                  {/* Attack total after roll */}
                  {isAttack && row.attackRolled && row.attackTotal !== null && (
                    <span className="text-xs font-semibold text-garnet-700">
                      Attack: {row.attackTotal}
                    </span>
                  )}

                  {/* Cast button */}
                  <button
                    type="button"
                    disabled={row.casting || !canCast}
                    onClick={() => handleCast(spell)}
                    title={isAttack && !row.attackRolled ? "Roll the attack first" : undefined}
                    className="rounded-control bg-arcane-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-arcane-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {row.casting ? "Casting…" : isCantrip ? "Cast" : `Cast (L${slot ?? spell.level})`}
                  </button>
                </div>
              </div>
            </div>

            {/* ── Cast result banner ── */}
            {row.castResult && spell.effectKind && (
              <div
                className={`flex items-center justify-between rounded-control px-3 py-2 ${
                  spell.effectKind === "heal"
                    ? "bg-vitality-50 text-vitality-800"
                    : "bg-garnet-50 text-garnet-800"
                }`}
              >
                <span className="text-xs font-semibold">
                  {spell.effectKind === "heal" ? "Healed" : "Damage"}:{" "}
                  <span className="font-display text-base">{row.castResult.total}</span>
                  <span className="ml-1 opacity-60">({row.castResult.diceStr})</span>
                  {row.target === "self" ? (
                    <span className="ml-1 text-[11px] opacity-70">→ applied to your HP</span>
                  ) : (
                    <span className="ml-1 text-[11px] opacity-70">→ tell your DM</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => patchRow(spell.id, { castResult: null })}
                  className="ml-2 opacity-50 hover:opacity-100"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            )}

            {/* ── Error ── */}
            {row.error && (
              <p className="text-xs font-semibold text-garnet-700">{row.error}</p>
            )}
          </div>
        );
      })}

      {/* ── Done button ── */}
      <div className="pt-3">
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100"
        >
          Done
        </button>
      </div>
    </div>
  );
}
