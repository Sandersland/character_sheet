/**
 * SpellsSection — interactive orchestrator for spellcasting on the character sheet.
 * Mirrors InventoryList.tsx: manages all spellcasting state locally, batches
 * API calls through applySpellcastingTransactions, and re-renders the whole
 * Character via onUpdate.
 *
 * Sub-components:
 *   SpellRow  — per-spell row (cast, prepare, forget, expand)
 *   AddSpellPanel — inline expand-in-place picker/custom form
 *
 * Roll flow: dice are rolled client-side (rollSpec from dice.ts), the total
 * is sent in the `castSpell` op as `roll`, and the result is displayed as an
 * inline banner. No auto-apply to HP this phase.
 */

import { useState } from "react";

import { applySpellcastingTransactions } from "@/api/client";
import { abilityAbbr, abilityModifier, formatModifier } from "@/lib/abilities";
import { computeCastRoll } from "@/lib/spellCast";
import type {
  AbilityName,
  Character,
  LearnSpellOperation,
  Spell,
} from "@/types/character";
import AddSpellPanel from "@/features/spells/AddSpellPanel";
import MeterBar from "@/components/ui/MeterBar";
import SpellRow from "@/features/spells/SpellRow";

interface SpellsSectionProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

/** The inline result banner shown immediately after a cast. */
interface CastResult {
  spellName: string;
  total: number;
  diceStr: string;       // e.g. "2d10" or "8d6"
  effectKind: "damage" | "heal";
  damageType?: string | null;
  slotLevel?: number;
}

export default function SpellsSection({ character, onUpdate }: SpellsSectionProps) {
  const spellcasting = character.spellcasting!;
  const { spellSaveDC, spellAttackBonus, slots = [], arcana = [], spells = [], ability } = spellcasting;
  const concentratingOn = spellcasting.concentratingOn ?? null;

  // Warlocks use Pact Magic (single-level slots that recharge on a short rest)
  // and gain Mystic Arcanum charges at higher levels — label/render accordingly.
  const isWarlock = (character.classes?.[0]?.name ?? "").toLowerCase() === "warlock";

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [castResult, setCastResult] = useState<CastResult | null>(null);
  const [addPanelOpen, setAddPanelOpen] = useState(false);

  // Spell levels for which the character has at least one slot remaining.
  const availableSlotLevels = slots
    .filter((s) => s.used < s.total)
    .map((s) => s.level)
    .sort((a, b) => a - b);

  // Mystic Arcanum spell levels with a charge remaining (Warlock 6th–9th).
  const availableArcanaLevels = arcana
    .filter((a) => a.used < a.total)
    .map((a) => a.level);

  // Which catalog spell ids are already in the spellbook (to disable duplicates in AddSpellPanel).
  const learnedSpellIds = new Set(spells.flatMap((s) => s.spellId ? [s.spellId] : []));

  // Group spells by level (0 = Cantrips, then 1–9).
  const sortedSpells = [...spells].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  // Unique spell levels present, in ascending order.
  const spellLevels = [...new Set(sortedSpells.map((s) => s.level))].sort((a, b) => a - b);

  // The spellcasting ability modifier (for healing bonus).
  const abilityScore = character.abilityScores[ability as AbilityName] ?? 10;
  const abilityMod = abilityModifier(abilityScore);

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function send(ops: Parameters<typeof applySpellcastingTransactions>[1]) {
    setBusy(true);
    setError(null);
    try {
      const updated = await applySpellcastingTransactions(character.id, ops);
      onUpdate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // ── Cast handler ────────────────────────────────────────────────────────────

  function handleCast(spell: Spell, slotLevel?: number) {
    const isCantrip = spell.level === 0;
    const resolvedSlotLevel = slotLevel ?? spell.level;

    // Compute roll via shared pure helper — null means no effect dice.
    const castRoll = computeCastRoll(spell, character, resolvedSlotLevel);

    if (!castRoll) {
      // No effect dice — just expend the slot (no roll to show).
      if (!isCantrip) {
        send([{ type: "castSpell", entryId: spell.id, slotLevel: resolvedSlotLevel, roll: 0 }]);
      }
      return;
    }

    const diceStr = `${castRoll.spec.count}d${castRoll.spec.faces}`;

    setCastResult({
      spellName: spell.name,
      total: castRoll.total,
      diceStr,
      effectKind: spell.effectKind!,
      damageType: spell.damageType,
      slotLevel: isCantrip ? undefined : slotLevel,
    });

    const ops: Parameters<typeof applySpellcastingTransactions>[1] = [
      isCantrip
        ? { type: "castSpell", entryId: spell.id, roll: castRoll.total }
        : { type: "castSpell", entryId: spell.id, slotLevel: resolvedSlotLevel, roll: castRoll.total },
    ];
    send(ops);
  }

  // ── Slot handlers ───────────────────────────────────────────────────────────

  function handleExpendSlot(level: number) {
    send([{ type: "expendSlot", level }]);
  }

  function handleRestoreSlot(level: number) {
    send([{ type: "restoreSlot", level }]);
  }

  // ── Spell list handlers ─────────────────────────────────────────────────────

  function handlePrepare(spell: Spell) {
    send([{ type: spell.prepared ? "unprepareSpell" : "prepareSpell", entryId: spell.id }]);
  }

  function handleForget(spell: Spell) {
    if (!confirm(`Remove ${spell.name} from your spellbook?`)) return;
    send([{ type: "forgetSpell", entryId: spell.id }]);
  }

  function handleLearn(op: LearnSpellOperation) {
    send([op]);
    // Keep panel open so multiple spells can be learned in one session.
  }

  function handleDropConcentration() {
    send([{ type: "dropConcentration" }]);
  }

  // ── Available slots per spell (for the slot picker in SpellRow) ─────────────
  // Only levels >= spell.level with remaining slots are valid choices. A 6th–9th
  // level spell with a matching Mystic Arcanum charge is also castable (the
  // backend routes a same-level cast to the arcanum charge since Pact slots cap
  // at level 5).
  function availableSlotsForSpell(spell: Spell): number[] {
    if (spell.level === 0) return [];
    const levels = availableSlotLevels.filter((l) => l >= spell.level);
    if (availableArcanaLevels.includes(spell.level) && !levels.includes(spell.level)) {
      levels.push(spell.level);
    }
    return levels.sort((a, b) => a - b);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5">
      {/* ── Stat bar: Save DC / Attack / Ability ── */}
      <div className="flex flex-wrap items-center gap-4 rounded-control bg-arcane-50 px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-arcane-700">
            Spell Save DC
          </p>
          <p className="font-display text-xl font-semibold text-arcane-900">
            {spellSaveDC}
          </p>
        </div>
        <div className="h-8 w-px bg-arcane-200" aria-hidden="true" />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-arcane-700">
            Spell Attack
          </p>
          <p className="font-display text-xl font-semibold text-arcane-900">
            {formatModifier(spellAttackBonus)}
          </p>
        </div>
        <div className="h-8 w-px bg-arcane-200" aria-hidden="true" />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-arcane-700">
            Ability
          </p>
          <p className="font-display text-xl font-semibold text-arcane-900">
            {ability ? abilityAbbr(ability) : "—"}
            <span className="ml-1 text-sm font-normal text-arcane-600">
              ({formatModifier(abilityMod)})
            </span>
          </p>
        </div>
      </div>

      {/* ── Active concentration banner ── */}
      {concentratingOn && (
        <div
          className="flex items-center justify-between gap-3 rounded-control border border-arcane-300 bg-arcane-50 px-4 py-2.5"
          role="status"
        >
          <p className="text-sm text-arcane-800">
            Concentrating on{" "}
            <span className="font-semibold">{concentratingOn.spellName}</span>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={handleDropConcentration}
            className="shrink-0 rounded bg-arcane-200 px-2.5 py-0.5 text-xs font-semibold text-arcane-800 hover:bg-arcane-300 disabled:opacity-40"
            title={`Stop concentrating on ${concentratingOn.spellName}`}
          >
            Drop concentration
          </button>
        </div>
      )}

      {/* ── Spell slot meters ── */}
      {slots.length > 0 && (
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
            {isWarlock ? (
              <>
                Pact Magic{" "}
                <span className="font-normal normal-case tracking-normal text-parchment-600">
                  — recharges on a short rest
                </span>
              </>
            ) : (
              "Spell Slots"
            )}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {slots.map((slot) => {
              const remaining = slot.total - slot.used;
              return (
                <div key={slot.level}>
                  <div className="mb-1 flex items-baseline justify-between text-xs text-parchment-600">
                    <span className="font-medium">Level {slot.level}</span>
                    <span className="tabular-nums">{remaining}/{slot.total}</span>
                  </div>
                  <MeterBar
                    current={remaining}
                    max={slot.total}
                    tone="arcane"
                    label={`Level ${slot.level} slots remaining`}
                  />
                  <div className="mt-1.5 flex gap-1">
                    {/* Expend one slot manually */}
                    <button
                      type="button"
                      disabled={busy || remaining === 0}
                      onClick={() => handleExpendSlot(slot.level)}
                      className="flex-1 rounded bg-arcane-100 py-0.5 text-[11px] font-semibold text-arcane-700 hover:bg-arcane-200 disabled:opacity-30"
                      title={`Expend a level ${slot.level} slot`}
                    >
                      − use
                    </button>
                    {/* Restore one slot manually */}
                    <button
                      type="button"
                      disabled={busy || slot.used === 0}
                      onClick={() => handleRestoreSlot(slot.level)}
                      className="flex-1 rounded bg-arcane-100 py-0.5 text-[11px] font-semibold text-arcane-700 hover:bg-arcane-200 disabled:opacity-30"
                      title={`Restore a level ${slot.level} slot`}
                    >
                      + restore
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Mystic Arcanum (Warlock 6th–9th) ── */}
      {arcana.length > 0 && (
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
            Mystic Arcanum{" "}
            <span className="font-normal normal-case tracking-normal text-parchment-600">
              — one cast each per long rest
            </span>
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {arcana.map((charge) => {
              const remaining = charge.total - charge.used;
              return (
                <div key={charge.level}>
                  <div className="mb-1 flex items-baseline justify-between text-xs text-parchment-600">
                    <span className="font-medium">Level {charge.level}</span>
                    <span className="tabular-nums">{remaining}/{charge.total}</span>
                  </div>
                  <MeterBar
                    current={remaining}
                    max={charge.total}
                    tone="gold"
                    label={`Level ${charge.level} Mystic Arcanum`}
                  />
                  <div className="mt-1.5 flex gap-1">
                    {/* Restore a spent arcanum (undo a mis-cast) */}
                    <button
                      type="button"
                      disabled={busy || charge.used === 0}
                      onClick={() => handleRestoreSlot(charge.level)}
                      className="flex-1 rounded bg-arcane-100 py-0.5 text-[11px] font-semibold text-arcane-700 hover:bg-arcane-200 disabled:opacity-30"
                      title={`Restore the level ${charge.level} Mystic Arcanum`}
                    >
                      + restore
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Inline cast result banner ── */}
      {castResult && (
        <div
          className={`flex items-center justify-between rounded-control px-4 py-3 ${
            castResult.effectKind === "heal"
              ? "bg-vitality-50 text-vitality-800"
              : "bg-garnet-50 text-garnet-800"
          }`}
        >
          <div>
            <p className="text-sm font-semibold">
              {castResult.spellName}
              {castResult.slotLevel ? ` (L${castResult.slotLevel})` : ""}
              {" — "}
              <span className="font-display text-lg">{castResult.total}</span>
              {" "}
              {castResult.effectKind === "heal"
                ? "healing"
                : `${castResult.damageType ?? ""} damage`}
            </p>
            <p className="text-xs opacity-70">{castResult.diceStr}</p>
          </div>
          <button
            type="button"
            onClick={() => setCastResult(null)}
            className="ml-4 text-sm opacity-60 hover:opacity-100"
            aria-label="Dismiss roll result"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <p className="rounded-control bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-700">
          {error}
        </p>
      )}

      {/* ── Spell list (grouped by level) ── */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
            Spellbook ({spells.length})
          </h3>
          {busy && (
            <span className="text-[10px] text-parchment-600">Saving…</span>
          )}
        </div>

        {spells.length === 0 ? (
          <p className="py-4 text-center text-sm text-parchment-600">
            No spells yet — add one below.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {spellLevels.map((lvl) => {
              const levelSpells = sortedSpells.filter((s) => s.level === lvl);
              const slotInfo = lvl === 0 ? null : slots.find((s) => s.level === lvl);
              return (
                <div key={lvl}>
                  {/* Level header — cantrips get a simple label; leveled groups show a slot meter */}
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-arcane-700">
                      {lvl === 0 ? "Cantrips" : `Level ${lvl}`}
                    </h4>
                    {slotInfo && (
                      <span className="text-[11px] tabular-nums text-arcane-600">
                        {slotInfo.total - slotInfo.used}/{slotInfo.total} slots
                      </span>
                    )}
                  </div>
                  <ul className="flex flex-col">
                    {levelSpells.map((spell) => (
                      <SpellRow
                        key={spell.id}
                        spell={spell}
                        characterLevel={character.level}
                        busy={busy}
                        onCast={handleCast}
                        onPrepare={handlePrepare}
                        onForget={handleForget}
                        availableSlots={availableSlotsForSpell(spell)}
                        isConcentrating={concentratingOn?.entryId === spell.id}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add Spell ── */}
      {addPanelOpen ? (
        <AddSpellPanel
          onLearn={handleLearn}
          onClose={() => setAddPanelOpen(false)}
          busy={busy}
          learnedSpellIds={learnedSpellIds}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAddPanelOpen(true)}
          className="self-start rounded-control border border-dashed border-arcane-300 px-3 py-1.5 text-xs font-semibold text-arcane-700 hover:border-arcane-500 hover:bg-arcane-50"
        >
          + Learn a spell
        </button>
      )}
    </div>
  );
}
