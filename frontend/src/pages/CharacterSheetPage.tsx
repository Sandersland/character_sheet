import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import AbilityScoreBox from "@/features/abilities/AbilityScoreBox";
import RollResultToast from "@/features/dice/RollResultToast";
import { RollProvider } from "@/features/dice/RollContext";
import ActivityModal from "@/features/character-meta/ActivityModal";
import AdvancementSection from "@/features/advancement/AdvancementSection";
import BackendStatus from "@/features/character-meta/BackendStatus";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import ClassFeaturesSection from "@/features/class/ClassFeaturesSection";
import DeleteCharacterModal from "@/features/character-meta/DeleteCharacterModal";
import ExperienceTracker from "@/features/experience/ExperienceTracker";
import HitPointTracker from "@/features/hitpoints/HitPointTracker";
import InventoryList from "@/features/inventory/InventoryList";
import JournalSection from "@/features/character-meta/JournalSection";
import SessionsModal from "@/features/session/SessionsModal";
import SkillsTable from "@/features/abilities/SkillsTable";
import SpellsSection from "@/features/spells/SpellsSection";
import ProficienciesCard from "@/features/abilities/ProficienciesCard";
import VitalsStrip from "@/features/character-meta/VitalsStrip";
import ConditionsStrip from "@/features/conditions/ConditionsStrip";
import { useCharacter } from "@/hooks/useCharacter";
import { useReferenceData } from "@/hooks/useReferenceData";
import { abilityAbbr, orderedAbilityEntries } from "@/lib/abilities";
import { fetchActiveSession, startSession } from "@/api/client";
import type { Session } from "@/types/character";

export default function CharacterSheetPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { character, error, setCharacter } = useCharacter(id);
  const { reference } = useReferenceData();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [activeSession, setActiveSession] = useState<Session | null | undefined>(undefined);
  const [sessionPending, setSessionPending] = useState(false);

  // Resolve active session on mount so the header button can say
  // "Start Session" or "Resume Session" correctly.
  useEffect(() => {
    if (!id) return;
    fetchActiveSession(id).then(setActiveSession).catch(() => setActiveSession(null));
  }, [id]);

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
    return (
      <div className="flex min-h-screen items-center justify-center bg-parchment-100">
        <p className="text-sm text-parchment-600">Loading character…</p>
      </div>
    );
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

  // Render abilities in canonical 5e order (STR-DEX-CON-INT-WIS-CHA) via the
  // shared helper rather than raw object key order, which is arbitrary and
  // surprised D&D players (it read WIS-CHA-STR-DEX-CON-INT).
  const abilityEntries = orderedAbilityEntries(character.abilityScores);

  return (
    <RollProvider>
    <div className="min-h-screen bg-parchment-100">
      <header className="border-b border-parchment-200 bg-parchment-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-4 px-6 py-5">
          <div>
            <Link
              to="/"
              className="text-xs font-semibold text-garnet-700 hover:underline"
            >
              ← All characters
            </Link>
            <h1 className="mt-1 font-display text-3xl font-semibold text-parchment-900">
              {character.name}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-parchment-600">
              <span>
                {character.race} {character.class}
                {character.subclass ? ` (${character.subclass})` : ""}
              </span>
              <Badge tone="garnet">Level {character.level}</Badge>
              <span className="text-parchment-400">
                {character.background} · {character.alignment}
              </span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <BackendStatus />
            <div className="flex flex-wrap items-center gap-3">
              {/* Start / Resume Session — the primary live-play entry point */}
              <button
                type="button"
                disabled={sessionPending || activeSession === undefined}
                onClick={async () => {
                  if (!id) return;
                  setSessionPending(true);
                  try {
                    if (activeSession) {
                      navigate(`/characters/${id}/session`);
                    } else {
                      const { session } = await startSession(id);
                      setActiveSession(session);
                      navigate(`/characters/${id}/session`);
                    }
                  } finally {
                    setSessionPending(false);
                  }
                }}
                className="rounded-control bg-garnet-700 px-3 py-1.5 text-xs font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 disabled:opacity-50"
              >
                {activeSession ? "Resume Session" : "Start Session"}
              </button>
              <button
                type="button"
                onClick={() => setSessionsOpen(true)}
                className="text-xs font-semibold text-arcane-700 hover:underline"
              >
                Sessions
              </button>
              <button
                type="button"
                onClick={() => setActivityOpen(true)}
                className="text-xs font-semibold text-arcane-700 hover:underline"
              >
                Activity
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                className="text-xs font-semibold text-garnet-700 hover:underline"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </header>

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
          onClose={() => setSessionsOpen(false)}
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
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr] lg:items-start">
          {/* Ability scores rail — fixed intrinsic width per
              principles.md ("don't over-rely on grid systems" for
              elements with a natural fixed width). `lg:items-start` on
              the parent is the actual fix for box proportions: CSS
              grid's default `align-items: stretch` was forcing this
              rail to match the Skills card's full height (~660px) and
              distributing that across 3 rows, ballooning every box to
              ~210px tall regardless of column count or padding — 2x3
              vs 3x2 only changed how many rows split that same forced
              height. With `items-start` the rail sizes to its own
              content and each box sits near its natural ~120x100px. */}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:w-[16rem] lg:grid-cols-2 lg:gap-3">
            {abilityEntries.map(([key, score]) => (
              <AbilityScoreBox
                key={key}
                label={abilityAbbr(key)}
                score={score}
                saveProficient={character.savingThrowProficiencies.includes(key)}
                proficiencyBonus={character.proficiencyBonus}
              />
            ))}
          </div>

          <Card title="Skills">
            <SkillsTable
              skills={character.skills}
              abilityScores={character.abilityScores}
              proficiencyBonus={character.proficiencyBonus}
            />
          </Card>
        </div>

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
            <JournalSection character={character} onUpdate={setCharacter} />
          )}
        </div>

        {/* ── Campaign Journal (spellcasters only — the 2-col row above
            uses the right column for Spells, so Journal gets its own row) */}
        {character.spellcasting && (
          <JournalSection character={character} onUpdate={setCharacter} />
        )}
      </main>
      <RollResultToast />
    </div>
    </RollProvider>
  );
}
