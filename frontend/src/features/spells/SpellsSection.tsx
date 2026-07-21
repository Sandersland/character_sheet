/**
 * SpellsSection — interactive orchestrator for spellcasting on the character sheet.
 * State + op batching live in useSpellcasting; pure list derivation in spellList;
 * pure cast planning in spellCast. This shell wires derived data + handlers into
 * the presentational subcomponents (overview, spellbook list, add-spell panel).
 *
 * Two mutually-exclusive views (caster-spellbook.html §1 vs §2/§4): the record block
 * (SpellcastingOverview, Cast door) is the default; "Manage spellbook →" opens the
 * grimoire (SpellbookList) as its own view with a Done control. They are never stacked.
 */

import { useState } from "react";

import { deriveSpellList, preparedBudget } from "@/lib/spellList";
import { availableSlotsForSpell } from "@/lib/spellPicker";
import type { Character, Spell } from "@/types/character";
import AddSpellPanel from "@/features/spells/AddSpellPanel";
import CastResultBanner from "@/features/spells/CastResultBanner";
import SpellbookList from "@/features/spells/SpellbookList";
import SpellcastingOverview from "@/features/spells/SpellcastingOverview";
import { useSpellcasting } from "@/features/spells/useSpellcasting";

interface SpellsSectionProps {
  character: Character;
  onUpdate: (character: Character) => void;
  /** A live session is active — the Cast door defers to the Combat tab (#1162). */
  isLive?: boolean;
  onGoToCombat?: () => void;
}

export default function SpellsSection({
  character,
  onUpdate,
  isLive = false,
  onGoToCombat = () => {},
}: SpellsSectionProps) {
  const spellcasting = character.spellcasting!;
  const { slots = [], spells = [] } = spellcasting;
  const concentratingOn = spellcasting.concentratingOn ?? null;

  const derived = deriveSpellList(character);
  const budget = preparedBudget(spellcasting);
  const [grimoireOpen, setGrimoireOpen] = useState(false);
  const {
    busy, error, castResult, addPanelOpen,
    setCastResult, setAddPanelOpen, send,
    handleCast, handlePrepare, handleForget, handleLearn, handleSwap,
  } = useSpellcasting(character, onUpdate);

  // The grimoire (prepare/swap/learn) is a distinct view reached from the record's
  // "Manage spellbook →" — not rendered alongside the record block.
  if (grimoireOpen) {
    return (
      <div className="flex flex-col gap-5">
        <SpellbookList
          spells={spells}
          sortedSpells={derived.sortedSpells}
          slots={slots}
          slotsArePactMagic={derived.slotsArePactMagic}
          characterLevel={character.level}
          budget={budget}
          busy={busy}
          concentratingOnEntryId={concentratingOn?.entryId ?? null}
          onPrepare={handlePrepare}
          onSwap={handleSwap}
          onForget={handleForget}
          availableSlotsFor={(spell: Spell) =>
            availableSlotsForSpell(spell, derived.availableSlotLevels, derived.availableArcanaLevels)
          }
          onAddSpell={() => setAddPanelOpen(true)}
        />

        {castResult && <CastResultBanner result={castResult} onDismiss={() => setCastResult(null)} />}
        {error && (
          <p className="rounded-control bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-700">
            {error}
          </p>
        )}

        {addPanelOpen && (
          <AddSpellPanel
            onLearn={handleLearn}
            onClose={() => setAddPanelOpen(false)}
            busy={busy}
            learnedSpellIds={derived.learnedSpellIds}
          />
        )}

        <div className="flex items-center justify-between gap-3 border-t border-parchment-200 pt-4">
          {addPanelOpen ? (
            <span />
          ) : (
            <button
              type="button"
              onClick={() => setAddPanelOpen(true)}
              className="rounded-control border border-dashed border-arcane-300 px-3 py-1.5 text-xs font-semibold text-arcane-700 hover:border-arcane-500 hover:bg-arcane-50"
            >
              + Learn a spell
            </button>
          )}
          <button
            type="button"
            onClick={() => setGrimoireOpen(false)}
            className="rounded-control bg-arcane-700 px-5 py-2 text-sm font-semibold text-white hover:bg-arcane-800"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <SpellcastingOverview
      character={character}
      derived={derived}
      busy={busy}
      error={error}
      castResult={castResult}
      isLive={isLive}
      onExpend={(level) => send([{ type: "expendSlot", level }])}
      onRestore={(level) => send([{ type: "restoreSlot", level }])}
      onCast={handleCast}
      onGoToCombat={onGoToCombat}
      onManageSpellbook={() => setGrimoireOpen(true)}
      onDropConcentration={() => send([{ type: "dropConcentration" }])}
      onDismissBuff={(entryId) => send([{ type: "dismissBuff", entryId }])}
      onDismissResult={() => setCastResult(null)}
    />
  );
}
