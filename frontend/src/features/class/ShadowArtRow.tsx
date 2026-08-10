/**
 * ShadowArtRow — one Shadow Art with an expandable description and a pool-cast
 * affordance. Shared by both editions (#1738): a 2024 Warrior of Shadow row
 * casts Darkness for 1 focus, a 2014 Way of Shadow row casts one of the
 * four-spell menu for 2 ki — `poolLabel`/`poolAvailable` are resolved by the
 * caller from the character's own resource pools (keyed off `art.cost.key`,
 * never a hardcoded "focus"). Renders through AbilityRowShell (shared with
 * ManeuverRow); the buff-chip path stays generic (shared with Channel
 * Divinity) even though no current Shadow Art uses it.
 */

import AbilityRowShell, { CastAbilityButton } from "@/features/class/AbilityRowShell";
import { shadowArtView } from "@/lib/shadowArts";
import type {
  CastShadowArtOperation,
  CatalogShadowArt,
} from "@/types/character";

interface Props {
  art: CatalogShadowArt;
  poolAvailable: number;
  /** Served DerivedResource.label for this row's pool ("Focus Points" / "Ki Points"). */
  poolLabel: string;
  busy: boolean;
  /** True when this Shadow Art is the character's active concentration. */
  isConcentrating: boolean;
  /** Name of the current concentration spell, to warn a cast will replace it. */
  concentratingOnName: string | null;
  onCast: (op: CastShadowArtOperation) => void;
}

export default function ShadowArtRow({
  art,
  poolAvailable,
  poolLabel,
  busy,
  isConcentrating,
  concentratingOnName,
  onCast,
}: Props) {
  const view = shadowArtView(art, poolAvailable, isConcentrating, concentratingOnName);

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
            {view.poolCost} {poolLabel}
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
              ? `Not enough ${poolLabel} (needs ${view.poolCost})`
              : `Cast ${view.displayName} (${view.poolCost} ${poolLabel})`
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
