import { Link } from "react-router-dom";

import type { CharacterSummary } from "@/types/character";
import Badge from "@/components/ui/Badge";
import { classSummary } from "@/lib/multiclass";

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
 * The media slot must stay a fixed 4:5 box in both states: an absolute-fill
 * img sits in flow, so its intrinsic height sets the flex item's min-content
 * floor and stretches the box past its aspect-ratio — pushing portrait cards
 * taller than monogram siblings if not fixed-size.
 */
export default function CharacterCard({ character }: CharacterCardProps) {
  return (
    <Link
      to={`/characters/${character.id}`}
      className="group flex flex-col overflow-hidden rounded-card border border-parchment-200 bg-parchment-50 shadow-card transition-shadow hover:shadow-raised focus-visible:shadow-raised"
    >
      <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden bg-gradient-to-br from-garnet-100 to-parchment-200">
        {character.portraitUrl ? (
          <img
            src={character.portraitUrl}
            alt={`Portrait of ${character.name}`}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span className="font-display text-3xl font-semibold text-garnet-700">
            {initials(character.name)}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h2 className="font-display text-lg font-semibold leading-tight text-parchment-900 group-hover:text-garnet-700">
          {character.name}
        </h2>
        <p className="text-sm text-parchment-600">
          {character.race} {classSummary(character.classes, { name: character.class })}
        </p>
        <div className="mt-auto pt-1">
          <Badge tone="garnet">Level {character.level}</Badge>
        </div>
      </div>
    </Link>
  );
}
