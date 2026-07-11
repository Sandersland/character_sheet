// Pure Way of Shadow row derivations — extracted from
// features/class/ShadowArtRow.tsx (#688). No JSX.

import { skillLabel } from "@/lib/abilities";
import type { CatalogShadowArt, SkillName } from "@/types/character";

/** Everything ShadowArtRow derives from its props. */
export interface ShadowArtView {
  /** Catalog name with the "Shadow Arts: " prefix stripped. */
  displayName: string;
  kiCost: number;
  canAfford: boolean;
  concentrates: boolean;
  /** "+10 Stealth" chip for a passive buff art, resolved through skillLabel. */
  buffLabel: string | null;
  /** Casting would replace a DIFFERENT active concentration. */
  willReplace: boolean;
}

export function shadowArtView(
  art: CatalogShadowArt,
  kiAvailable: number,
  isConcentrating: boolean,
  concentratingOnName: string | null,
): ShadowArtView {
  const kiCost = art.cost.kind === "pool" ? art.cost.base : 0;
  const concentrates = art.effect.concentration ?? false;
  const buffLabel =
    art.effect.effectType === "buff" && art.effect.buffTarget
      ? `${(art.effect.buffModifier ?? 0) >= 0 ? "+" : ""}${art.effect.buffModifier ?? 0} ${skillLabel(art.effect.buffTarget as SkillName)}`
      : null;
  return {
    displayName: art.name.replace(/^Shadow Arts:\s*/, ""),
    kiCost,
    canAfford: kiAvailable >= kiCost,
    concentrates,
    buffLabel,
    willReplace: concentrates && !isConcentrating && Boolean(concentratingOnName),
  };
}
