// Shared by both editions' menus — every field here reads off the catalog row's own `cost`, never a hardcoded pool name, so the same view serves whichever pool (focus or ki) a row costs.
import { skillLabel } from "@/lib/abilities";
import type { CatalogShadowArt, Character, ResourcePool, SkillName } from "@/types/character";

/** Everything ShadowArtRow derives from its props. */
export interface ShadowArtView {
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

// Resolved by the catalog row's own `cost.key` (never a hardcoded "focus") — a 2024 row points at "focus", a 2014 row at "ki".
export function poolForArt(character: Character, art: CatalogShadowArt): ResourcePool | undefined {
  const cost = art.cost;
  if (cost.kind !== "pool") return undefined;
  return character.resources?.pools.find((p) => p.key === cost.key);
}

// Deduped by key — one entry for a 2024 Warrior of Shadow (focus), one for a 2014 Way of Shadow (ki); a Map preserves first-seen order without a second dependency.
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

// The backend stamps a Shadow Art's concentration entryId with the shadow-art: prefix (disjoint from Spell.id) — this strips it back off.
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
