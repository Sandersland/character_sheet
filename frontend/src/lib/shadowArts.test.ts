import { describe, expect, it } from "vitest";

import { shadowArtView } from "@/lib/shadowArts";
import type { CatalogShadowArt } from "@/types/character";

const art = (over: Partial<CatalogShadowArt> = {}): CatalogShadowArt => ({
  id: "sa-1",
  name: "Shadow Arts: Darkness",
  description: "Magical darkness.",
  minLevel: 3,
  cost: { kind: "pool", key: "ki", base: 2 },
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
    expect(view.kiCost).toBe(2);
    expect(view.canAfford).toBe(true);
    expect(shadowArtView(art(), 1, false, null).canAfford).toBe(false);
  });

  it("a none-cost art costs 0 and is always affordable", () => {
    const view = shadowArtView(art({ cost: { kind: "none" } }), 0, false, null);
    expect(view.kiCost).toBe(0);
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
