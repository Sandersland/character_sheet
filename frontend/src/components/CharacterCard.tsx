import { Link } from "react-router-dom";

import type { CharacterSummary } from "../types/character";
import Badge from "./Badge";

interface CharacterCardProps {
  character: CharacterSummary;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Top-image-style preview card (components.md: "Top-image cards fit
 * grids") — portrait placeholder, name as the lead, race/class/level as
 * de-emphasized supporting metadata (principles.md: avoid naked
 * label:value, fold the count into natural language instead).
 */
export default function CharacterCard({ character }: CharacterCardProps) {
  return (
    <Link
      to={`/characters/${character.id}`}
      className="group flex flex-col overflow-hidden rounded-card border border-parchment-200 bg-parchment-50 shadow-card transition-shadow hover:shadow-raised focus-visible:shadow-raised"
    >
      <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-garnet-100 to-parchment-200">
        {character.portraitUrl ? (
          <img
            src={character.portraitUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="font-display text-3xl font-semibold text-garnet-700">
            {initials(character.name)}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-display text-lg font-semibold leading-tight text-parchment-900 group-hover:text-garnet-700">
          {character.name}
        </h3>
        <p className="text-sm text-parchment-600">
          {character.race} {character.class}
        </p>
        <div className="mt-auto pt-1">
          <Badge tone="garnet">Level {character.level}</Badge>
        </div>
      </div>
    </Link>
  );
}
