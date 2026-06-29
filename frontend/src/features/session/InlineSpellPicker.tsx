/**
 * InlineSpellPicker — inline spell list for the TurnHub's spell resolution.
 *
 * Mirrors InlineAttackPicker.tsx in structure. For each prepared/known spell
 * that is castable right now (cantrip always; leveled spells need a remaining
 * slot ≥ spell level), the player can:
 *
 *   1. (leveled spells only) Choose a slot level via a dropdown — shows a live
 *      effect preview using computeCastSpec so the player sees the upcast delta
 *      before committing.
 *   2. Choose a target: "self" (HP is automatically adjusted) or "other"
 *      (roll is displayed via the toast for the DM / GM to apply). Default:
 *      "other" for damage, "self" for heal. Locked to "self" when range is "Self".
 *   3. For attack spells (attackType === "attack"): pressing **Attack** rolls the
 *      d20 via useRoll() AND consumes the economy slot (onCommitSlot). Cast is
 *      then enabled to roll damage. For save spells: display the save DC + ability.
 *   4. Cast → computeCastSpec for the dice spec → roll() via RollContext (toast)
 *      → applySpellcastingTransactions → (non-attack: onCommitSlot) → onUpdate.
 *      Panel stays open for multiple casts.
 *
 * Action economy:
 *   - Non-attack spells (save/heal/utility): slot consumed on CAST (via onCommitSlot).
 *   - Attack spells: slot consumed on the ATTACK ROLL button press. Cast then
 *     becomes enabled (gated by attackRolled, not slotAvailable). This means a miss
 *     where Cast is never pressed still spends the action — matching 5e rules.
 *     With a second action (Action Surge), the player may Attack again then Cast.
 *
 * 5e bonus-action spell restriction:
 *   - Casting a leveled bonus-action spell → action picker shows cantrips only.
 *   - Casting a leveled action spell → bonus-action spell picker is blocked.
 *
 * All roll results surface in the global RollResultToast (no inline banners).
 *
 * Explicit "Done" button closes the panel (never auto-closes).
 */

import { useState } from "react";

import { useRoll } from "@/features/dice/RollContext";
import { formatModifier } from "@/lib/abilities";
import { applySpellcastingTransactions, logRoll } from "@/api/client";
import { computeCastSpec } from "@/lib/spellCast";
import { formatRollSpec } from "@/lib/dice";
import {
  SCHOOL_TONE,
  levelLabel,
  effectPreviewWithMod,
  componentsLabel,
  saveDcLabel,
} from "@/lib/spellMeta";
import Badge from "@/components/ui/Badge";
import type { Character, Spell } from "@/types/character";
import type { SpellCastKind } from "@/features/session/useTurnState";

// ── Types ─────────────────────────────────────────────────────────────────────

interface InlineSpellPickerProps {
  character: Character;
  /** Active session id — spell attack rolls are logged against it. */
  sessionId: string;
  onUpdate: (c: Character) => void;
  onClose: () => void;
  /** Called after a roll is logged so the Session Log can refresh. */
  onLogChanged: () => void;
  /** Which economy slot this picker is managing. */
  slot: "action" | "bonusAction" | "reaction";
  /** True when the slot is still available to spend. */
  slotAvailable: boolean;
  /**
   * Called with the spell's level when a cast succeeds, so TurnHub can commit
   * the appropriate action/bonus/reaction slot (and record the spell kind for
   * the 5e bonus-action restriction).
   */
  onCommitSlot: (spellLevel: number) => void;
  /** From useTurnState — used to enforce the 5e bonus-action spell restriction. */
  spellCastThisTurn: { action?: SpellCastKind; bonus?: SpellCastKind };
  /**
   * Optional filter on casting time. When provided, only spells whose
   * castingTime starts with this prefix are shown (e.g. "1 action",
   * "1 bonus action", "1 reaction"). Applied to ALL spells including cantrips.
   */
  castingTimeFilter?: string;
}

type Target = "self" | "other";

interface SpellRowState {
  slotLevel: number | undefined;  // chosen slot level (undefined = not picked yet)
  target: Target;
  casting: boolean;
  attackRolled: boolean;  // true once Attack was pressed (attack spells only); gates Cast
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
  sessionId,
  onUpdate,
  onClose,
  onLogChanged,
  slot,
  slotAvailable,
  onCommitSlot,
  spellCastThisTurn,
  castingTimeFilter,
}: InlineSpellPickerProps) {
  const { roll } = useRoll();
  const spellcasting = character.spellcasting!;
  const { slots = [], arcana = [], spells = [], spellSaveDC, spellAttackBonus } = spellcasting;

  // Per-spell row state keyed by spell.id.
  const [rowStates, setRowStates] = useState<Record<string, SpellRowState>>({});

  function getRow(spellId: string, spell: Spell, resolvedSlot: number | undefined): SpellRowState {
    return rowStates[spellId] ?? {
      slotLevel: resolvedSlot,
      target: defaultTarget(spell),
      casting: false,
      attackRolled: false,
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

  // Warlock Mystic Arcanum levels (6th–9th) with a charge remaining. These are
  // cast at their natural level; the backend routes the cast to the arcanum
  // charge since Pact slots never reach level 6+.
  const availableArcanaLevels = arcana
    .filter((a) => a.used < a.total)
    .map((a) => a.level);

  /** True when a cast at this level draws from a Mystic Arcanum charge, not a slot. */
  function isArcanumLevel(level: number | undefined): boolean {
    return level !== undefined && availableArcanaLevels.includes(level);
  }

  // 5e bonus-action restriction helpers.
  // Cast leveled spell as action → bonus-action spell picker is fully blocked.
  const bonusActionBlockedByActionSpell =
    slot === "bonusAction" && spellCastThisTurn.action === "leveled";
  // Cast leveled spell as bonus action → only cantrips allowed with the action.
  const actionLimitedToCantrips =
    slot === "action" && spellCastThisTurn.bonus === "leveled";

  // Castable spells: prepared (or cantrips), slot available, casting-time matches,
  // and not blocked by the 5e bonus-action restriction.
  const castableSpells = spells.filter((spell) => {
    if (!spell.prepared && spell.level > 0) return false;

    // Casting-time filter applies to ALL spells including cantrips.
    if (castingTimeFilter) {
      if (!spell.castingTime?.toLowerCase().startsWith(castingTimeFilter.toLowerCase())) return false;
    }

    // 5e restriction: bonus-action spell picker blocked entirely by leveled action spell.
    if (bonusActionBlockedByActionSpell) return false;

    // 5e restriction: action picker limited to cantrips when a bonus-action leveled spell was cast.
    if (actionLimitedToCantrips && spell.level > 0) return false;

    if (spell.level === 0) return true; // cantrip — no slot needed
    const hasSlotsAvailable = availableSlotLevels.some((l) => l >= spell.level);
    return hasSlotsAvailable || isArcanumLevel(spell.level);
  });

  // Sort: cantrips first, then ascending level, then alphabetically.
  const sortedSpells = [...castableSpells].sort(
    (a, b) => a.level - b.level || a.name.localeCompare(b.name),
  );

  // ── Slot picker helpers ──────────────────────────────────────────────────────

  /** Available slot levels for a given leveled spell (incl. a Mystic Arcanum charge). */
  function availableSlotsForSpell(spell: Spell): number[] {
    if (spell.level === 0) return [];
    const levels = availableSlotLevels.filter((l) => l >= spell.level);
    if (isArcanumLevel(spell.level) && !levels.includes(spell.level)) {
      levels.push(spell.level);
    }
    return levels.sort((a, b) => a - b);
  }

  /** Resolved slot level for a spell: the row's chosen level, or the lowest available. */
  function resolvedSlot(spell: Spell, row: SpellRowState): number | undefined {
    if (spell.level === 0) return undefined;
    if (row.slotLevel !== undefined) return row.slotLevel;
    const s = availableSlotsForSpell(spell);
    return s[0];
  }

  // ── Cast handler ─────────────────────────────────────────────────────────────

  async function handleCast(spell: Spell) {
    const isCantrip = spell.level === 0;
    const row = rowStates[spell.id] ?? {
      ...getRow(spell.id, spell, undefined),
      slotLevel: availableSlotsForSpell(spell)[0],
    };
    const spellSlot = resolvedSlot(spell, row);

    patchRow(spell.id, { casting: true, error: null });

    // Roll damage/heal via RollContext — result surfaces in the global toast.
    const castSpec = computeCastSpec(spell, character, spellSlot ?? spell.level);
    let rollTotal = 0;
    if (castSpec) {
      const kindLabel = spell.effectKind === "heal" ? "healing" : "damage";
      const targetNote = row.target === "self" ? " → your HP" : "";
      const result = roll(castSpec, `${spell.name} — ${kindLabel}${targetNote}`);
      rollTotal = result.total;
    }

    // Self-targeted effect: pass to the backend so HP is adjusted in the same transaction.
    const applyPayload =
      row.target === "self" && castSpec && spell.effectKind
        ? { target: "self" as const, kind: spell.effectKind as "heal" | "damage", amount: rollTotal }
        : undefined;

    const op = isCantrip
      ? { type: "castSpell" as const, entryId: spell.id, roll: rollTotal, apply: applyPayload }
      : { type: "castSpell" as const, entryId: spell.id, slotLevel: spellSlot!, roll: rollTotal, apply: applyPayload };

    try {
      const updated = await applySpellcastingTransactions(character.id, [op]);
      // Attack spells: slot was already committed on the Attack roll button press.
      // Non-attack spells (save/heal/utility): commit the economy slot now on cast.
      if (spell.attackType !== "attack") {
        onCommitSlot(spell.level);
      }
      onUpdate(updated);
      patchRow(spell.id, { casting: false, attackRolled: false });
    } catch (err) {
      patchRow(spell.id, {
        casting: false,
        error: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  // Economy hint shown when no further casts are possible.
  const slotUsedHint = bonusActionBlockedByActionSpell
      ? "Leveled spell cast this turn — bonus-action spell casting is not allowed (5e)."
      : actionLimitedToCantrips
        ? "Bonus-action spell cast this turn — only cantrips may be cast with the action (5e)."
        : null;

  if (castableSpells.length === 0 && !slotUsedHint) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-parchment-600">
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
    <div className="flex flex-col gap-0">
      {/* Economy / 5e restriction hint */}
      {slotUsedHint && (
        <p className="mb-2 rounded bg-parchment-100 px-3 py-2 text-[11px] font-semibold text-parchment-600">
          {slotUsedHint}
        </p>
      )}

      {sortedSpells.map((spell) => {
        const isCantrip = spell.level === 0;
        const schoolTone = SCHOOL_TONE[spell.school as keyof typeof SCHOOL_TONE] ?? "neutral";
        const availableSlots = availableSlotsForSpell(spell);
        const initRow = getRow(spell.id, spell, availableSlots[0]);
        const row = rowStates[spell.id] ?? initRow;
        const spellSlot = resolvedSlot(spell, row);
        const usesArcanum = !isCantrip && isArcanumLevel(spellSlot ?? spell.level);
        const locked = targetLocked(spell);
        const preview = effectPreviewWithMod(spell, character, spellSlot);
        const compStr = componentsLabel(spell);
        const isAttack = spell.attackType === "attack";
        const isSave = spell.attackType === "save";
        const dcLabel = isSave ? saveDcLabel(spell, spellSaveDC ?? 0) : null;

        // Attack spells: Cast is gated by attackRolled (slot already spent on Attack).
        // Non-attack spells: Cast is gated by economy slot availability.
        const castDisabled = row.casting || (isAttack ? !row.attackRolled : !slotAvailable);

        return (
          <div key={spell.id} className="flex flex-col gap-1.5 py-3 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-parchment-200">
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
                    {usesArcanum && <Badge tone="gold">arcanum</Badge>}
                  </div>
                </div>
                <p className="text-xs text-parchment-600">
                  {spell.castingTime} · {spell.range}
                </p>
                {preview && (
                  <p className="text-xs text-parchment-600">{preview}</p>
                )}
                {compStr && (
                  <p className="text-[11px] text-parchment-600">{compStr}</p>
                )}
              </div>

              {/* ── Right: target toggle + slot picker + cast buttons ── */}
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {/* Slot / upcast selector (leveled only, multiple options) */}
                {!isCantrip && availableSlots.length > 1 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-parchment-600">Slot:</span>
                    {availableSlots.map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => patchRow(spell.id, { slotLevel: lvl })}
                        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors ${
                          spellSlot === lvl
                            ? "bg-arcane-700 text-white"
                            : "bg-arcane-100 text-arcane-800 hover:bg-arcane-200"
                        }`}
                      >
                        L{lvl}
                        {lvl !== spell.level && <span className="ml-0.5 opacity-60">↑</span>}
                      </button>
                    ))}
                  </div>
                )}

                {/* Slot display when only one option */}
                {!isCantrip && availableSlots.length === 1 && (
                  <span className="text-[11px] text-parchment-600">
                    {usesArcanum ? "Mystic Arcanum" : `Slot: L${availableSlots[0]}`}
                  </span>
                )}

                {/* Target toggle */}
                {spell.effectKind && (
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-parchment-600">Target:</span>
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
                    <span className="text-[11px] text-parchment-600">½ on save</span>
                  )}

                  {/* Attack roll button (attack spells) — consumes the economy slot and
                      enables Cast. Disabled once the slot is spent (no second attack
                      unless Action Surge refills actionsRemaining → slotAvailable). */}
                  {isAttack && (
                    <button
                      type="button"
                      disabled={row.casting || !slotAvailable}
                      onClick={() => {
                        // Commit the economy slot first (action is spent on the attack declaration).
                        onCommitSlot(spell.level);
                        const attackSpec = { count: 1, faces: 20, modifier: spellAttackBonus ?? 0 };
                        const result = roll(attackSpec, `${spell.name} spell attack`);
                        // Log the spell attack roll (best-effort — never blocks play).
                        logRoll(character.id, sessionId, {
                          kind: "attack",
                          source: spell.name,
                          total: result.total,
                          specLabel: formatRollSpec(attackSpec),
                        })
                          .then(onLogChanged)
                          .catch((e) => console.error("roll log failed", e));
                        patchRow(spell.id, { attackRolled: true });
                      }}
                      className="rounded-control border border-garnet-200 bg-garnet-50 px-2.5 py-1 text-xs font-semibold text-garnet-700 transition-colors hover:bg-garnet-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Attack {formatModifier(spellAttackBonus ?? 0)}
                    </button>
                  )}

                  {/* Cast button — gated only by economy + slot availability */}
                  <button
                    type="button"
                    disabled={castDisabled}
                    onClick={() => handleCast(spell)}
                    className="rounded-control bg-arcane-700 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-arcane-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {row.casting ? "Casting…" : isCantrip ? "Cast" : usesArcanum ? "Cast (Arcanum)" : `Cast (L${spellSlot ?? spell.level})`}
                  </button>
                </div>
              </div>
            </div>

            {/* ── Error ── */}
            {row.error && (
              <p className="text-xs font-semibold text-garnet-700">{row.error}</p>
            )}
          </div>
        );
      })}

      {/* Empty state when 5e rule blocks everything */}
      {castableSpells.length === 0 && slotUsedHint && (
        <p className="py-2 text-sm text-parchment-600">No spells available.</p>
      )}

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
