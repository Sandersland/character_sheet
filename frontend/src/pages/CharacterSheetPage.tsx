import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { fetchCharacter } from "../api/client";
import AbilityScoreBox from "../components/AbilityScoreBox";
import BackendStatus from "../components/BackendStatus";
import Badge from "../components/Badge";
import Card from "../components/Card";
import DeleteCharacterModal from "../components/DeleteCharacterModal";
import ExperienceTracker from "../components/ExperienceTracker";
import InventoryList from "../components/InventoryList";
import JournalSection from "../components/JournalSection";
import SkillsTable from "../components/SkillsTable";
import SpellsSection from "../components/SpellsSection";
import VitalsStrip from "../components/VitalsStrip";
import { ABILITY_LABELS } from "../lib/abilities";
import type { Character } from "../types/character";

function useCharacter(id: string | undefined) {
  const [character, setCharacter] = useState<Character | null | undefined>(undefined);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    setCharacter(undefined);
    setError(false);
    fetchCharacter(id)
      .then((data) => {
        if (mounted) setCharacter(data);
      })
      .catch(() => {
        if (mounted) setError(true);
      });
    return () => {
      mounted = false;
    };
  }, [id]);

  return { character, error, setCharacter };
}

export default function CharacterSheetPage() {
  const { id } = useParams();
  const { character, error, setCharacter } = useCharacter(id);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--color-parchment-100)] px-6 text-center">
        <h1 className="font-display text-2xl font-semibold text-[var(--color-garnet-800)]">
          Something went wrong
        </h1>
        <p className="text-sm text-[var(--color-parchment-600)]">
          Couldn't load this character. Check that the backend is running and
          try refreshing.
        </p>
        <Link
          to="/"
          className="rounded-[var(--radius-control)] bg-[var(--color-garnet-700)] px-4 py-2 text-sm font-semibold text-[var(--color-parchment-50)] transition-colors hover:bg-[var(--color-garnet-800)]"
        >
          Back to characters
        </Link>
      </div>
    );
  }

  if (character === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-parchment-100)]">
        <p className="text-sm text-[var(--color-parchment-600)]">Loading character…</p>
      </div>
    );
  }

  if (character === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--color-parchment-100)] px-6 text-center">
        <h1 className="font-display text-2xl font-semibold text-[var(--color-parchment-900)]">
          Character not found
        </h1>
        <p className="text-sm text-[var(--color-parchment-600)]">
          There's no character with id "{id}" in this campaign yet.
        </p>
        <Link
          to="/"
          className="rounded-[var(--radius-control)] bg-[var(--color-garnet-700)] px-4 py-2 text-sm font-semibold text-[var(--color-parchment-50)] transition-colors hover:bg-[var(--color-garnet-800)]"
        >
          Back to characters
        </Link>
      </div>
    );
  }

  const abilityEntries = Object.entries(character.abilityScores) as [
    keyof typeof character.abilityScores,
    number
  ][];

  return (
    <div className="min-h-screen bg-[var(--color-parchment-100)]">
      <header className="border-b border-[var(--color-parchment-200)] bg-[var(--color-parchment-50)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-4 px-6 py-5">
          <div>
            <Link
              to="/"
              className="text-xs font-semibold text-[var(--color-garnet-700)] hover:underline"
            >
              ← All characters
            </Link>
            <h1 className="mt-1 font-display text-3xl font-semibold text-[var(--color-parchment-900)]">
              {character.name}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--color-parchment-600)]">
              <span>
                {character.race} {character.class}
                {character.subclass ? ` (${character.subclass})` : ""}
              </span>
              <Badge tone="garnet">Level {character.level}</Badge>
              <span className="text-[var(--color-parchment-400)]">
                {character.background} · {character.alignment}
              </span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <BackendStatus />
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              className="text-xs font-semibold text-[var(--color-garnet-700)] hover:underline"
            >
              Delete character
            </button>
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

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        <VitalsStrip character={character} />
        <ExperienceTracker character={character} onUpdate={setCharacter} />

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
                label={ABILITY_LABELS[key].slice(0, 3).toUpperCase()}
                score={score}
                saveProficient={character.savingThrowProficiencies.includes(
                  key
                )}
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <InventoryList character={character} onUpdate={setCharacter} />

          {character.spellcasting ? (
            <Card title="Spells" className="p-4">
              <SpellsSection spellcasting={character.spellcasting} />
            </Card>
          ) : (
            <Card title="Journal" className="p-4">
              <JournalSection entries={character.journal} />
            </Card>
          )}
        </div>

        {character.spellcasting && (
          <Card title="Journal" className="p-4">
            <JournalSection entries={character.journal} />
          </Card>
        )}
      </main>
    </div>
  );
}
