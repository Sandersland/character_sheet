import { Link } from "react-router-dom";

import type { Character } from "@/types/character";

interface LevelUpBannerProps {
  character: Character;
}

/**
 * The armed entry point to the level-up ceremony (#892): a full-bleed gold band
 * pinned under the sheet header on every tab (above the mobile scroller) whenever
 * XP has outpaced the applied level. Null — reclaiming its height — with nothing
 * pending. The old below-the-fold HP-card callout is retired in its favor.
 */
export default function LevelUpBanner({ character }: LevelUpBannerProps) {
  const { pendingLevelUps, level, id } = character;
  if (pendingLevelUps < 1) return null;

  const resolve =
    pendingLevelUps > 1
      ? `Resolve your ${pendingLevelUps} advancements to gain their benefits.`
      : "Resolve your advancement to gain its benefits.";

  return (
    <div className="border-y border-gold-300 bg-gradient-to-r from-gold-50 to-gold-100">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
        <span aria-hidden className="text-lg leading-none text-gold-600">
          ✦
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold text-gold-900">
            You've reached Level {level}
          </p>
          <p className="text-xs text-gold-800">{resolve}</p>
        </div>
        <Link
          to={`/characters/${id}/level-up`}
          className="rounded-control bg-garnet-700 px-4 py-1.5 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600 focus-visible:ring-offset-1"
        >
          Level Up
        </Link>
      </div>
    </div>
  );
}
