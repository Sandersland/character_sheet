import RollButton from "@/features/dice/RollButton";
import { formatModifier } from "@/lib/abilities";
import type { Character } from "@/types/character";

// Flat quick-bar cell: centered value-over-label column, no tile chrome — the
// wrapper's divide-x supplies the only separation (#1084).
const CELL = "flex flex-1 flex-col items-center px-1 py-1";
const VALUE = "font-display text-base font-semibold leading-none text-garnet-800";
const LABEL = "mt-1 text-[9px] font-semibold uppercase tracking-wide text-parchment-600";

/**
 * Mobile-only Prof/Speed/Init strip (#1026, reworked #1084). These left the
 * compact header (which keeps the reactive HP + AC); on phones they sit at the
 * top of Overview as a slim divided quick-bar. Desktop keeps them in the banner
 * (`md:hidden`).
 */
export default function MobileQuickBar({ character }: { character: Character }) {
  return (
    <div className="flex divide-x divide-parchment-200 md:hidden">
      <div className={CELL}>
        <span className={VALUE}>{formatModifier(character.proficiencyBonus)}</span>
        <span className={LABEL}>Prof Bonus</span>
      </div>
      <div className={CELL}>
        <span className={VALUE}>{character.speed} ft</span>
        <span className={LABEL}>Speed</span>
      </div>
      <RollButton
        spec={{ count: 1, faces: 20, modifier: character.initiativeBonus }}
        label="Initiative"
        log={{ kind: "initiative", source: "Initiative" }}
        className={CELL}
      >
        <span className={VALUE}>{formatModifier(character.initiativeBonus)}</span>
        <span className={LABEL}>Initiative</span>
      </RollButton>
    </div>
  );
}
