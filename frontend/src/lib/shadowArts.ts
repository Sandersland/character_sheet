// Pure Warrior of Shadow row derivations — extracted from ShadowArtRow (#688). No JSX.

import { skillLabel } from "@/lib/abilities";
import type { CatalogShadowArt, SkillName } from "@/types/character";

/** Everything ShadowArtRow derives from its props. */
export interface ShadowArtView {
  /** Catalog name with the "Shadow Arts: " prefix stripped. */
  displayName: string;
  focusCost: number;
  canAfford: boolean;
  concentrates: boolean;
  /** "+10 Stealth" chip for a passive buff art, resolved through skillLabel. */
  buffLabel: string | null;
  /** Casting would replace a DIFFERENT active concentration. */
  willReplace: boolean;
}

export function shadowArtView(
  art: CatalogShadowArt,
  focusAvailable: number,
  isConcentrating: boolean,
  concentratingOnName: string | null,
): ShadowArtView {
  const focusCost = art.cost.kind === "pool" ? art.cost.base : 0;
  const concentrates = art.effect.concentration ?? false;
  const buffLabel =
    art.effect.effectType === "buff" && art.effect.buffTarget
      ? `${(art.effect.buffModifier ?? 0) >= 0 ? "+" : ""}${art.effect.buffModifier ?? 0} ${skillLabel(art.effect.buffTarget as SkillName)}`
      : null;
  return {
    displayName: art.name.replace(/^Shadow Arts:\s*/, ""),
    focusCost,
    canAfford: focusAvailable >= focusCost,
    concentrates,
    buffLabel,
    willReplace: concentrates && !isConcentrating && Boolean(concentratingOnName),
  };
}
