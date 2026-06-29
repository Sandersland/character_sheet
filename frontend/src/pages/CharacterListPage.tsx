import { Link } from "react-router-dom";

import BackendStatus from "@/features/character-meta/BackendStatus";
import CharacterCard from "@/features/character-meta/CharacterCard";
import Spinner from "@/components/ui/Spinner";
import { useCharacterList } from "@/hooks/useCharacterList";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";

function NewCharacterCard() {
  return (
    <Link
      to="/characters/new"
      className="flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-parchment-300 bg-transparent p-4 text-parchment-600 transition-colors hover:border-garnet-400 hover:text-garnet-700 focus-visible:border-garnet-400 focus-visible:text-garnet-700"
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
      <Link
        to="/characters/new"
        className="mt-2 rounded-control bg-garnet-700 px-4 py-2 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 focus-visible:bg-garnet-800"
      >
        New Character
      </Link>
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
  const showSpinner = useDelayedFlag(characters === null && !error);

  return (
    <div className="min-h-screen bg-parchment-100">
      <div className="border-b border-parchment-200 bg-parchment-50">
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
      </div>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {error ? (
          <ErrorState />
        ) : characters === null ? (
          showSpinner ? <Spinner className="py-16" /> : null
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
