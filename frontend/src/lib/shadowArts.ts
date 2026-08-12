// Pure Shadow Arts row derivations — extracted from ShadowArtRow (#688).
// Shared by both editions' menus (2024 Warrior of Shadow's flat 1-focus
// Darkness cast and 2014 Way of Shadow's 4-spell 2-ki menu, #1738): every
// field here reads off the catalog row's own `cost`, never a hardcoded pool
// name, so the same view serves whichever pool (focus or ki) a row costs.
// No JSX.

import { skillLabel } from "@/lib/abilities";
import type { CatalogShadowArt, Character, ResourcePool, SkillName } from "@/types/character";

/** Everything ShadowArtRow derives from its props. */
export interface ShadowArtView {
  /** Catalog name with the "Shadow Arts: " prefix stripped. */
  displayName: string;
  poolCost: number;
  canAfford: boolean;
  concentrates: boolean;
  /** "+10 Stealth" chip for a passive buff art, resolved through skillLabel. */
  buffLabel: string | null;
  /** Casting would replace a DIFFERENT active concentration. */
  willReplace: boolean;
}

export function shadowArtView(
  art: CatalogShadowArt,
  poolAvailable: number,
  isConcentrating: boolean,
  concentratingOnName: string | null,
): ShadowArtView {
  const poolCost = art.cost.kind === "pool" ? art.cost.base : 0;
  const concentrates = art.effect.concentration ?? false;
  const buffLabel =
    art.effect.effectType === "buff" && art.effect.buffTarget
      ? `${(art.effect.buffModifier ?? 0) >= 0 ? "+" : ""}${art.effect.buffModifier ?? 0} ${skillLabel(art.effect.buffTarget as SkillName)}`
      : null;
  return {
    displayName: art.name.replace(/^Shadow Arts:\s*/, ""),
    poolCost,
    canAfford: poolAvailable >= poolCost,
    concentrates,
    buffLabel,
    willReplace: concentrates && !isConcentrating && Boolean(concentratingOnName),
  };
}

// The resource pool a Shadow Art row spends from, resolved by the catalog
// row's own `cost.key` (never a hardcoded "focus") — a 2024 row points at
// "focus", a 2014 row at "ki" (#1738). Extracted out of ShadowArtsSection so
// the branching lives in one pure, directly-tested unit rather than inflating
// the component's own complexity score.
export function poolForArt(character: Character, art: CatalogShadowArt): ResourcePool | undefined {
  const cost = art.cost;
  if (cost.kind !== "pool") return undefined;
  return character.resources?.pools.find((p) => p.key === cost.key);
}

// Distinct pools a loaded Shadow Arts menu actually spends from, deduped by
// key — one entry for a 2024 Warrior of Shadow (focus), one for a 2014 Way of
// Shadow (ki). A Map preserves first-seen order without a second dependency.
export function summaryPools(character: Character, catalog: CatalogShadowArt[] | null): ResourcePool[] {
  return Array.from(
    new Map(
      (catalog ?? [])
        .map((art) => poolForArt(character, art))
        .filter((pool): pool is ResourcePool => pool !== undefined)
        .map((pool) => [pool.key, pool] as const),
    ).values(),
  );
}

// The id of the Shadow Art currently held as concentration, or null — the
// backend stamps a Shadow Art's concentration entryId with the shadow-art:
// prefix (disjoint from Spell.id) so this strips it back off.
export function concentratingShadowArtId(entryId: string | undefined): string | null {
  const prefix = "shadow-art:";
  return entryId?.startsWith(prefix) ? entryId.slice(prefix.length) : null;
}

export interface ConcentratingArtState {
  concentratingOn: { entryId: string; spellName: string } | null;
  concentratingArtId: string | null;
}

export function concentratingArtState(character: Character): ConcentratingArtState {
  const concentratingOn = character.spellcasting?.concentratingOn ?? null;
  return {
    concentratingOn,
    concentratingArtId: concentratingShadowArtId(concentratingOn?.entryId),
  };
}
