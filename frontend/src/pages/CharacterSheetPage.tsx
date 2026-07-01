import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import AbilityScoresPanel from "@/features/abilities/AbilityScoresPanel";
import RollResultToast from "@/features/dice/RollResultToast";
import { RollProvider } from "@/features/dice/RollContext";
import ActivityModal from "@/features/character-meta/ActivityModal";
import AdvancementSection from "@/features/advancement/AdvancementSection";
import CharacterSheetHeader from "@/features/character-meta/CharacterSheetHeader";
import Card from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import ClassFeaturesSection from "@/features/class/ClassFeaturesSection";
import DeleteCharacterModal from "@/features/character-meta/DeleteCharacterModal";
import ExperienceTracker from "@/features/experience/ExperienceTracker";
import HitPointTracker from "@/features/hitpoints/HitPointTracker";
import InventoryList from "@/features/inventory/InventoryList";
import JournalSection from "@/features/character-meta/JournalSection";
import CapturePalette from "@/features/journal/CapturePalette";
import SessionsModal from "@/features/session/SessionsModal";
import SpellsSection from "@/features/spells/SpellsSection";
import ProficienciesCard from "@/features/abilities/ProficienciesCard";
import VitalsStrip from "@/features/character-meta/VitalsStrip";
import ConditionsStrip from "@/features/conditions/ConditionsStrip";
import { useCharacter } from "@/hooks/useCharacter";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { useGlobalKeyboard } from "@/hooks/useGlobalKeyboard";
import { useReferenceData } from "@/hooks/useReferenceData";
import { useSessionButton } from "@/features/session/useSessionButton";

export default function CharacterSheetPage() {
  const { id } = useParams();
  const { character, error, setCharacter } = useCharacter(id);
  const { reference } = useReferenceData();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const showSpinner = useDelayedFlag(character === undefined && !error);
  const session = useSessionButton(id, character);

  // Cmd/Ctrl+J opens the quick-capture palette from anywhere on the sheet.
  useGlobalKeyboard(() => setCaptureOpen(true));

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-parchment-100 px-6 text-center">
        <h1 className="font-display text-2xl font-semibold text-garnet-800">
          Something went wrong
        </h1>
        <p className="text-sm text-parchment-600">
          Couldn't load this character. Check that the backend is running and
          try refreshing.
        </p>
        <Link
          to="/"
          className="rounded-control bg-garnet-700 px-4 py-2 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800"
        >
          Back to characters
        </Link>
      </div>
    );
  }

  if (character === undefined) {
    return showSpinner ? <Spinner variant="page" /> : null;
  }

  if (character === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-parchment-100 px-6 text-center">
        <h1 className="font-display text-2xl font-semibold text-parchment-900">
          Character not found
        </h1>
        <p className="text-sm text-parchment-600">
          There's no character with id "{id}" in this campaign yet.
        </p>
        <Link
          to="/"
          className="rounded-control bg-garnet-700 px-4 py-2 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800"
        >
          Back to characters
        </Link>
      </div>
    );
  }

  return (
    <RollProvider>
    <div className="min-h-screen bg-parchment-100">
      <CharacterSheetHeader
        character={character}
        session={session}
        onOpenCapture={() => setCaptureOpen(true)}
        onOpenSessions={() => setSessionsOpen(true)}
        onOpenActivity={() => setActivityOpen(true)}
        onOpenDelete={() => setConfirmDeleteOpen(true)}
      />

      {confirmDeleteOpen && (
        <DeleteCharacterModal
          characterId={character.id}
          characterName={character.name}
          onClose={() => setConfirmDeleteOpen(false)}
        />
      )}

      {activityOpen && (
        <ActivityModal
          characterId={character.id}
          onClose={() => setActivityOpen(false)}
          onUpdate={setCharacter}
        />
      )}

      {sessionsOpen && (
        <SessionsModal
          characterId={character.id}
          campaignId={character.campaignId}
          onClose={() => setSessionsOpen(false)}
        />
      )}

      {captureOpen && (
        <CapturePalette
          character={character}
          sessionId={session.activeSessionId}
          onClose={() => setCaptureOpen(false)}
          onUpdate={setCharacter}
        />
      )}

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">

        {/* ── Combat vitals at a glance ───────────────────────────────── */}
        <VitalsStrip character={character} />

        {/* ── Active conditions + exhaustion ──────────────────────────── */}
        <ConditionsStrip character={character} onUpdate={setCharacter} />

        {/* ── Hit points · Experience ────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <HitPointTracker character={character} onUpdate={setCharacter} />
          <ExperienceTracker character={character} onUpdate={setCharacter} />
        </div>

        {/* ── Ability scores · Saves · Skills ────────────────────────── */}
        <AbilityScoresPanel character={character} />

        {/* ── Proficiencies & Languages ───────────────────────────────── */}
        {/* Weapons, armor (derived from class/race/feats), and tools
            (creation-fixed + subclass choices). Hidden only when the character
            has nothing to display and no pending tool choice (e.g. test fixtures). */}
        {(character.toolProficiencies.length > 0 ||
          (character.resources?.toolProfChoiceCount ?? 0) > 0 ||
          (character.armorProficiencies?.length ?? 0) > 0 ||
          (character.weaponProficiencies?.length ?? 0) > 0) && (
          <Card title="Proficiencies" className="p-4">
            <ProficienciesCard
              character={character}
              artisanTools={reference?.tools.byCategory.artisan ?? []}
              onUpdate={setCharacter}
            />
          </Card>
        )}

        {/* ── Features & Traits ──────────────────────────────────────── */}
        {/* Class features + Advancements grouped together, as they would be
            on a printed sheet (your class abilities, feats, and ASI sit
            alongside each other rather than scattered). ClassFeaturesSection
            handles the subclass picker, resource pools, maneuvers, and feature
            list. AdvancementSection handles ASI + feats (level 4+ only). */}
        {character.class && (
          <Card title="Class Features" className="p-4">
            <ClassFeaturesSection
              character={character}
              referenceClasses={reference?.classes ?? []}
              onUpdate={setCharacter}
            />
          </Card>
        )}

        {(character.advancementSlots.total > 0 || character.advancements.length > 0) && (
          <div id="advancement-card">
            <Card title="Advancements" className="p-4">
              <AdvancementSection
                character={character}
                onUpdate={setCharacter}
              />
            </Card>
          </div>
        )}

        {/* ── Equipment · Spells ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <InventoryList character={character} onUpdate={setCharacter} />

          {character.spellcasting ? (
            <Card title="Spells" className="p-4">
              <SpellsSection character={character} onUpdate={setCharacter} />
            </Card>
          ) : (
            <JournalSection
              character={character}
              onUpdate={setCharacter}
              sessionId={session.inActiveSession ? session.activeSessionId : undefined}
            />
          )}
        </div>

        {/* ── Campaign Journal (spellcasters only — the 2-col row above
            uses the right column for Spells, so Journal gets its own row) */}
        {character.spellcasting && (
          <JournalSection
            character={character}
            onUpdate={setCharacter}
            sessionId={session.inActiveSession ? session.activeSessionId : undefined}
          />
        )}
      </main>
      <RollResultToast />
    </div>
    </RollProvider>
  );
}
