import { describe, expect, it } from "vitest";

import { concentratingArtState, concentratingShadowArtId, poolForArt, shadowArtView, summaryPools } from "@/lib/shadowArts";
import type { CatalogShadowArt, Character, ResourcePool } from "@/types/character";

const art = (over: Partial<CatalogShadowArt> = {}): CatalogShadowArt => ({
  id: "sa-1",
  name: "Shadow Arts: Darkness",
  description: "Magical darkness.",
  minLevel: 3,
  cost: { kind: "pool", key: "focus", base: 2 },
  effect: {
    effectType: "utility",
    damageType: null,
    attackType: null,
    saveAbility: null,
    saveEffect: null,
    scaling: { mode: "none" },
    concentration: true,
  },
  ...over,
});

describe("shadowArtView (#688)", () => {
  it("strips the name prefix and gates affordability on the pool cost", () => {
    const view = shadowArtView(art(), 4, false, null);
    expect(view.displayName).toBe("Darkness");
    expect(view.poolCost).toBe(2);
    expect(view.canAfford).toBe(true);
    expect(shadowArtView(art(), 1, false, null).canAfford).toBe(false);
  });

  it("a none-cost art costs 0 and is always affordable", () => {
    const view = shadowArtView(art({ cost: { kind: "none" } }), 0, false, null);
    expect(view.poolCost).toBe(0);
    expect(view.canAfford).toBe(true);
  });

  it("builds the buff chip through skillLabel with a sign", () => {
    const buffed = art({
      effect: {
        effectType: "buff",
        damageType: null,
        attackType: null,
        saveAbility: null,
        saveEffect: null,
        scaling: { mode: "none" },
        concentration: true,
        buffTarget: "stealth",
        buffModifier: 10,
      },
    });
    expect(shadowArtView(buffed, 4, false, null).buffLabel).toBe("+10 Stealth");
  });

  it("warns willReplace only when a DIFFERENT concentration is active", () => {
    expect(shadowArtView(art(), 4, false, "Fixture Bless").willReplace).toBe(true);
    expect(shadowArtView(art(), 4, true, "Darkness").willReplace).toBe(false);
    expect(shadowArtView(art(), 4, false, null).willReplace).toBe(false);
    const nonConc = art({ effect: { ...art().effect, concentration: false } });
    expect(shadowArtView(nonConc, 4, false, "Fixture Bless").willReplace).toBe(false);
  });
});

const kiPool: ResourcePool = { key: "ki", label: "Ki Points", total: 4, recharge: "shortRest", used: 0, remaining: 4 };
const focusPool: ResourcePool = { key: "focus", label: "Focus Points", total: 3, recharge: "shortRest", used: 0, remaining: 3 };

function makeCharacter(pools: ResourcePool[]): Character {
  return {
    id: "char-1",
    resources: { features: [], pools, maneuversKnown: [], toolProficienciesKnown: [] },
  } as unknown as Character;
}

// #1738: poolForArt/summaryPools resolve the served pool by the catalog row's
// own cost.key — the same functions serve a 2024 (focus) or 2014 (ki) menu.
describe("poolForArt (#1738)", () => {
  it("resolves the pool matching the row's cost.key", () => {
    const character = makeCharacter([focusPool, kiPool]);
    expect(poolForArt(character, art({ cost: { kind: "pool", key: "ki", base: 2 } }))).toBe(kiPool);
    expect(poolForArt(character, art({ cost: { kind: "pool", key: "focus", base: 1 } }))).toBe(focusPool);
  });

  it("returns undefined for a none-cost row or a missing pool", () => {
    const character = makeCharacter([focusPool]);
    expect(poolForArt(character, art({ cost: { kind: "none" } }))).toBeUndefined();
    expect(poolForArt(character, art({ cost: { kind: "pool", key: "ki", base: 2 } }))).toBeUndefined();
  });
});

describe("summaryPools (#1738)", () => {
  it("dedupes to one entry per distinct pool key across the loaded catalog", () => {
    const character = makeCharacter([kiPool]);
    const catalog = [
      art({ id: "a", cost: { kind: "pool", key: "ki", base: 2 } }),
      art({ id: "b", cost: { kind: "pool", key: "ki", base: 2 } }),
    ];
    expect(summaryPools(character, catalog)).toEqual([kiPool]);
  });

  it("returns [] when the catalog hasn't loaded yet (null)", () => {
    expect(summaryPools(makeCharacter([kiPool]), null)).toEqual([]);
  });
});

describe("concentratingShadowArtId (#1738)", () => {
  it("strips the shadow-art: prefix", () => {
    expect(concentratingShadowArtId("shadow-art:sa-1")).toBe("sa-1");
  });

  it("returns null for an unprefixed or undefined entryId", () => {
    expect(concentratingShadowArtId("spellbook:bless")).toBeNull();
    expect(concentratingShadowArtId(undefined)).toBeNull();
  });
});

describe("concentratingArtState (#1738)", () => {
  it("bundles concentratingOn + the stripped art id off the spellcasting rider", () => {
    const character = {
      spellcasting: { concentratingOn: { entryId: "shadow-art:sa-silence", spellName: "Shadow Arts: Silence" } },
    } as unknown as Character;
    expect(concentratingArtState(character)).toEqual({
      concentratingOn: { entryId: "shadow-art:sa-silence", spellName: "Shadow Arts: Silence" },
      concentratingArtId: "sa-silence",
    });
  });

  it("defaults to null/null when the character isn't concentrating on a Shadow Art", () => {
    const character = { spellcasting: { concentratingOn: { entryId: "spellbook:bless", spellName: "Bless" } } } as unknown as Character;
    expect(concentratingArtState(character)).toEqual({
      concentratingOn: { entryId: "spellbook:bless", spellName: "Bless" },
      concentratingArtId: null,
    });
  });

  it("defaults to null/null when spellcasting is absent", () => {
    const character = {} as unknown as Character;
    expect(concentratingArtState(character)).toEqual({ concentratingOn: null, concentratingArtId: null });
  });
});
