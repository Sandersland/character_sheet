import RollButton from "@/features/dice/RollButton";
import { formatModifier } from "@/lib/abilities";
import type { Character } from "@/types/character";

// Compact vital-tile shell — border, tint, centered label/value column.
const TILE =
  "flex flex-col items-center justify-center rounded-control border border-parchment-200 bg-parchment-100 px-1 py-2";
const VALUE = "font-display text-base font-semibold leading-none text-garnet-800";
const LABEL = "mt-1 text-[9px] font-semibold uppercase tracking-wide text-parchment-600";

/**
 * Mobile-only Init/Speed/Prof row (#1026). These left the compact header (which
 * now keeps only the reactive HP + AC); on phones they live at the top of
 * Overview — one swipe away. Desktop keeps them in the banner (`md:hidden`).
 */
export default function MobileOverviewVitals({ character }: { character: Character }) {
  return (
    <div className="flex gap-1.5 md:hidden">
      <RollButton
        spec={{ count: 1, faces: 20, modifier: character.initiativeBonus }}
        label="Initiative"
        log={{ kind: "initiative", source: "Initiative" }}
        className={`${TILE} flex-1`}
      >
        <span className={VALUE}>{formatModifier(character.initiativeBonus)}</span>
        <span className={LABEL}>Init</span>
      </RollButton>
      <div className={`${TILE} flex-1`}>
        <span className={VALUE}>{character.speed}</span>
        <span className={LABEL}>Speed</span>
      </div>
      <div className={`${TILE} flex-1`}>
        <span className={VALUE}>{formatModifier(character.proficiencyBonus)}</span>
        <span className={LABEL}>Prof</span>
      </div>
    </div>
  );
}
