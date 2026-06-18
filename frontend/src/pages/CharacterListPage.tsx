import { useEffect, useState } from "react";

import { fetchCharacters } from "../api/client";
import BackendStatus from "../components/BackendStatus";
import CharacterCard from "../components/CharacterCard";
import type { CharacterSummary } from "../types/character";

function useCharacterList() {
  const [characters, setCharacters] = useState<CharacterSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    setError(false);
    fetchCharacters()
      .then((data) => {
        if (mounted) setCharacters(data);
      })
      .catch(() => {
        if (mounted) setError(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return { characters, error };
}

function NewCharacterCard() {
  return (
    <button
      type="button"
      className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-[var(--color-parchment-300)] bg-transparent p-4 text-[var(--color-parchment-500)] transition-colors hover:border-[var(--color-garnet-400)] hover:text-[var(--color-garnet-700)] focus-visible:border-[var(--color-garnet-400)] focus-visible:text-[var(--color-garnet-700)]"
      style={{ aspectRatio: "4 / 3" }}
      onClick={() => {
        // Will route to a character-creation flow once that exists; no
        // backend model to create against yet (see CLAUDE.md).
        window.alert("Character creation isn't available yet — coming in a later phase.");
      }}
    >
      <span
        className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-current text-xl leading-none"
        aria-hidden="true"
      >
        +
      </span>
      <span className="font-sans text-sm font-semibold">New Character</span>
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--color-parchment-300)] px-6 py-16 text-center">
      <span className="font-display text-2xl text-[var(--color-parchment-800)]">
        No characters yet
      </span>
      <p className="max-w-sm text-sm text-[var(--color-parchment-600)]">
        Create your first adventurer to start tracking ability scores, HP,
        inventory, and spells in one place.
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--color-garnet-300)] px-6 py-16 text-center">
      <span className="font-display text-2xl text-[var(--color-garnet-800)]">
        Couldn't load characters
      </span>
      <p className="max-w-sm text-sm text-[var(--color-parchment-600)]">
        The backend may be unreachable. Check that it's running and try
        refreshing.
      </p>
    </div>
  );
}

export default function CharacterListPage() {
  const { characters, error } = useCharacterList();

  return (
    <div className="min-h-screen bg-[var(--color-parchment-100)]">
      <header className="border-b border-[var(--color-parchment-200)] bg-[var(--color-parchment-50)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-wide text-[var(--color-garnet-700)]">
              Your Party
            </p>
            <h1 className="font-display text-2xl font-semibold text-[var(--color-parchment-900)]">
              Characters
            </h1>
          </div>
          <BackendStatus />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {error ? (
          <ErrorState />
        ) : characters === null ? (
          <p className="text-sm text-[var(--color-parchment-600)]">Loading characters…</p>
        ) : characters.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {characters.map((character) => (
              <CharacterCard key={character.id} character={character} />
            ))}
            <NewCharacterCard />
          </div>
        )}
      </main>
    </div>
  );
}
