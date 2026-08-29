import { useState } from "react";

import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { deriveSpellList, preparedBudget } from "@/lib/spellList";
import { availableSlotsForSpell } from "@/lib/spellPicker";
import type { Spell } from "@/types/character";
import AddSpellPanel from "@/features/spells/AddSpellPanel";
import CastResultBanner from "@/features/spells/CastResultBanner";
import SpellbookList from "@/features/spells/SpellbookList";
import SpellcastingOverview from "@/features/spells/SpellcastingOverview";
import { useSpellcasting } from "@/features/spells/useSpellcasting";

interface SpellsSectionProps {
  isLive?: boolean;
  onGoToCombat?: () => void;
}

export default function SpellsSection({
  isLive = false,
  onGoToCombat = () => {},
}: SpellsSectionProps) {
  const { character } = useCurrentCharacter();
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
  } = useSpellcasting(character);

  if (grimoireOpen) {
    return (
      // #1859: px-4 md:px-0 compensates for CharacterSheetBody's <main> having no mobile padding (matches ClassPanel's gutter pattern) without doubling desktop padding.
      <div className="flex flex-col gap-5 px-4 md:px-0">
        <SpellbookList
          spells={spells}
          sortedSpells={derived.sortedSpells}
          slots={slots}
          slotsArePactMagic={derived.slotsArePactMagic}
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
            edition={character.rulesEdition}
            characterId={character.id}
          />
        )}

        {/* #1859: sticky bottom pins Learn/Done above SheetBottomNav's missing mobile clearance; bg-parchment-100 matches index.css body so scrolled rows don't show through; md:static reverts since desktop doesn't scroll this region. */}
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-parchment-200 bg-parchment-100 pt-4 pb-4 md:static md:pb-0">
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
