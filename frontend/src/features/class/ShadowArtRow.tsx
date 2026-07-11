/**
 * ShadowArtRow — a single Way of Shadow Shadow Art with an expandable
 * description and a flat 2-ki cast affordance. Renders through AbilityRowShell
 * (shared with ManeuverRow/DisciplineRow); Shadow Arts are flat-cost,
 * roll-less utility/buff spells, so there is no ki scaling here.
 */

import AbilityRowShell, { CastAbilityButton } from "@/features/class/AbilityRowShell";
import { shadowArtView } from "@/lib/shadowArts";
import type {
  CastShadowArtOperation,
  CatalogShadowArt,
} from "@/types/character";

interface Props {
  art: CatalogShadowArt;
  kiAvailable: number;
  busy: boolean;
  /** True when this Shadow Art is the character's active concentration. */
  isConcentrating: boolean;
  /** Name of the current concentration spell, to warn a cast will replace it. */
  concentratingOnName: string | null;
  onCast: (op: CastShadowArtOperation) => void;
}

export default function ShadowArtRow({
  art,
  kiAvailable,
  busy,
  isConcentrating,
  concentratingOnName,
  onCast,
}: Props) {
  const view = shadowArtView(art, kiAvailable, isConcentrating, concentratingOnName);

  function handleCast() {
    if (busy || !view.canAfford) return;
    onCast({ type: "castShadowArt", shadowArtId: art.id });
  }

  return (
    <AbilityRowShell
      name={view.displayName}
      chips={
        <>
          <span className="text-[10px] text-gold-700" aria-hidden="true">
            {view.kiCost} ki
          </span>
          {view.concentrates &&
            (isConcentrating ? (
              <span className="rounded-control bg-arcane-700 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-parchment-50">
                concentrating
              </span>
            ) : (
              <span className="rounded-control bg-arcane-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-arcane-800">
                conc
              </span>
            ))}
          {view.buffLabel && (
            <span className="rounded-control bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700">
              {view.buffLabel}
            </span>
          )}
        </>
      }
      actions={
        <CastAbilityButton
          disabled={busy || !view.canAfford}
          onClick={handleCast}
          title={
            !view.canAfford
              ? `Not enough ki (needs ${view.kiCost})`
              : `Cast ${view.displayName} (${view.kiCost} ki)`
          }
        />
      }
      warning={
        view.willReplace ? (
          <p className="mt-1 text-[11px] text-arcane-800" role="status">
            Casting replaces concentration on {concentratingOnName}.
          </p>
        ) : undefined
      }
    >
      <p className="text-xs leading-relaxed text-parchment-600">{art.description}</p>
    </AbilityRowShell>
  );
}
