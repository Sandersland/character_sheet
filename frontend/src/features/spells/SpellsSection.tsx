/**
 * SpellsSection — interactive orchestrator for spellcasting on the character sheet.
 * State + op batching live in useSpellcasting; pure list derivation in lib/spellList;
 * pure cast planning in lib/spellCast. This shell wires derived data + handlers into
 * the presentational subcomponents (overview, spellbook list, add-spell panel).
 */

import { deriveSpellList } from "@/lib/spellList";
import { availableSlotsForSpell } from "@/lib/spellPicker";
import type { Character, Spell } from "@/types/character";
import AddSpellPanel from "@/features/spells/AddSpellPanel";
import SpellbookList from "@/features/spells/SpellbookList";
import SpellcastingOverview from "@/features/spells/SpellcastingOverview";
import { useSpellcasting } from "@/features/spells/useSpellcasting";

interface SpellsSectionProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

export default function SpellsSection({ character, onUpdate }: SpellsSectionProps) {
  const spellcasting = character.spellcasting!;
  const { slots = [], spells = [] } = spellcasting;
  const concentratingOn = spellcasting.concentratingOn ?? null;

  const derived = deriveSpellList(character);
  const {
    busy, error, castResult, addPanelOpen,
    setCastResult, setAddPanelOpen, send,
    handleCast, handlePrepare, handleForget, handleLearn,
  } = useSpellcasting(character, onUpdate);

  return (
    <div className="flex flex-col gap-5">
      <SpellcastingOverview
        character={character}
        derived={derived}
        busy={busy}
        error={error}
        castResult={castResult}
        onExpend={(level) => send([{ type: "expendSlot", level }])}
        onRestore={(level) => send([{ type: "restoreSlot", level }])}
        onDropConcentration={() => send([{ type: "dropConcentration" }])}
        onDismissBuff={(entryId) => send([{ type: "dismissBuff", entryId }])}
        onDismissResult={() => setCastResult(null)}
      />

      <SpellbookList
        spells={spells}
        sortedSpells={derived.sortedSpells}
        spellLevels={derived.spellLevels}
        slots={slots}
        characterLevel={character.level}
        busy={busy}
        concentratingOnEntryId={concentratingOn?.entryId ?? null}
        onCast={handleCast}
        onPrepare={handlePrepare}
        onForget={handleForget}
        availableSlotsFor={(spell: Spell) =>
          availableSlotsForSpell(spell, derived.availableSlotLevels, derived.availableArcanaLevels)
        }
        onAddSpell={() => setAddPanelOpen(true)}
      />

      {addPanelOpen ? (
        <AddSpellPanel
          onLearn={handleLearn}
          onClose={() => setAddPanelOpen(false)}
          busy={busy}
          learnedSpellIds={derived.learnedSpellIds}
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
