import { Link } from "react-router-dom";

interface CharacterLoadErrorProps {
  variant: "error" | "not-found";
  characterId?: string;
}

export default function CharacterLoadError({ variant, characterId }: CharacterLoadErrorProps) {
  const isError = variant === "error";
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-parchment-100 px-6 text-center">
      <h1
        className={`font-display text-2xl font-semibold ${
          isError ? "text-garnet-800" : "text-parchment-900"
        }`}
      >
        {isError ? "Something went wrong" : "Character not found"}
      </h1>
      <p className="text-sm text-parchment-600">
        {isError
          ? "Couldn't load this character. Check that the backend is running and try refreshing."
          : `There's no character with id "${characterId}" in this campaign yet.`}
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
