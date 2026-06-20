import { Link } from "react-router-dom";

import BackendStatus from "@/features/character-meta/BackendStatus";
import CharacterCard from "@/features/character-meta/CharacterCard";
import { useCharacterList } from "@/hooks/useCharacterList";

function NewCharacterCard() {
  return (
    <Link
      to="/characters/new"
      className="flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-parchment-300 bg-transparent p-4 text-parchment-500 transition-colors hover:border-garnet-400 hover:text-garnet-700 focus-visible:border-garnet-400 focus-visible:text-garnet-700"
      style={{ aspectRatio: "4 / 3" }}
    >
      <span
        className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-current text-xl leading-none"
        aria-hidden="true"
      >
        +
      </span>
      <span className="font-sans text-sm font-semibold">New Character</span>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-parchment-300 px-6 py-16 text-center">
      <span className="font-display text-2xl text-parchment-800">
        No characters yet
      </span>
      <p className="max-w-sm text-sm text-parchment-600">
        Create your first adventurer to start tracking ability scores, HP,
        inventory, and spells in one place.
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-garnet-300 px-6 py-16 text-center">
      <span className="font-display text-2xl text-garnet-800">
        Couldn't load characters
      </span>
      <p className="max-w-sm text-sm text-parchment-600">
        The backend may be unreachable. Check that it's running and try
        refreshing.
      </p>
    </div>
  );
}

export default function CharacterListPage() {
  const { characters, error } = useCharacterList();

  return (
    <div className="min-h-screen bg-parchment-100">
      <header className="border-b border-parchment-200 bg-parchment-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-wide text-garnet-700">
              Your Party
            </p>
            <h1 className="font-display text-2xl font-semibold text-parchment-900">
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
          <p className="text-sm text-parchment-600">Loading characters…</p>
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
