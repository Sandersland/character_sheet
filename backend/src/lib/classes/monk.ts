import type { RulesEdition } from "@character-sheet/shared-types";

import { abilityModifier, deriveMartialArtsDie } from "@/lib/srd/srd.js";

import type { ClassDefinition, DerivedResource, InitiativeRegen } from "./types.js";

// Monk save DC — used by Stunning Strike, Open Hand Technique, Quivering Palm
// (live-play automation lives in their own modules, which import this), focus
// features, and Warrior of the Elements (Elemental Burst / Elemental Strikes
// force this DC). Renamed for #1499 — the old name cited only the 2024 pool
// ("Focus"), which no longer holds once the derivation layer serves 2014
// characters too. "Ki save DC = 8 + your proficiency bonus + your Wisdom
// modifier" (SRD 5.1 Monk, Ki / PHB'14 p.78) and "Focus save DC = 8 + Wisdom
// modifier + Proficiency Bonus" (SRD 5.2 Monk, Focus / PHB'24 p.88) are the
// identical formula, so this takes no `edition` — only the pool NAME forks
// (see monkPoolKey).
export function monkSaveDC(abilityScores: Record<string, number>, profBonus: number): number {
  return 8 + profBonus + abilityModifier(abilityScores.wisdom ?? 10);
}

// The Monk pool's vocabulary by edition (#1313 D3) — Ki Points (SRD 5.1 /
// PHB'14 p.78) vs Focus Points (SRD 5.2 / PHB'24 p.88). Count, start level (2),
// and recharge (short or long rest) are identical in both editions and don't
// fork — only this name does. Consumed by resourceFn below (#1500), the 2014
// monk action rows (lib/classes/actions.ts), and Stunning Strike
// (stunning-strike.ts)'s own pool spend.
export function monkPoolKey(edition: RulesEdition): "ki" | "focus" {
  return edition === "EDITION_2014" ? "ki" : "focus";
}

// Feature TEXT moved off this module onto literal seed rows
// (prisma/seed/monk-features.ts, #1675) — the twelfth and last class retab
// (#1134/#1522's roster completion). This module survives (unlike fighter.ts/
// barbarian.ts/rogue.ts, deleted outright) purely for its resourceFn's: the
// base Focus/Ki pool below, and three subclasses' own pools (Wholeness of
// Body, Flurry of Healing and Harm, Hand of Ultimate Mercy) — none of which
// #1675 moved (transport-only slice, pools are a later chunk's job per
// #1313's plan).
export const monk: ClassDefinition = {
  // subclassKey is unused here — the base monk pool never needs to resolve a
  // subclass-specific variant (unlike druid's wildShape, #906) — but the full
  // parameter list must be declared so `edition` can reach deriveMartialArtsDie
  // below (#1499; see ResourceFn's header for why a shorter list would also
  // typecheck for every OTHER class's resourceFn).
  resourceFn: (level, abilityScores, profBonus, _subclassKey, edition) => {
    if (level < 2) return [];
    const saveDC = monkSaveDC(abilityScores, profBonus);
    const key = monkPoolKey(edition);

    // 2014 (SRD 5.1 / PHB'14 p.78): Ki has no Uncanny Metabolism/Perfect
    // Focus analog — the only onInitiative descriptor is Perfect Self (L20),
    // firing ONLY when ki is fully exhausted (`threshold: 0`), unlike 2024's
    // "3 or fewer" trigger. #1313's scope: "2014 emits no onInitiative below
    // L20 (no Uncanny Metabolism, no Perfect Focus)."
    if (edition === "EDITION_2014") {
      const onInitiative: InitiativeRegen[] = level >= 20 ? [{ id: "perfectSelf", amount: 4, threshold: 0 }] : [];
      return [
        {
          key,
          label: "Ki Points",
          total: level,
          recharge: "short-or-long",
          ...(onInitiative.length > 0 ? { onInitiative } : {}),
          description: `Fuel ki features: Flurry of Blows (1 ki), Patient Defense (1 ki), Step of the Wind (1 ki), Deflect Missiles' throw-back (1 ki), and subclass abilities. Ki save DC ${saveDC}. Regain all ki on a short or long rest.`,
        },
      ];
    }

    // 2024 (SRD 5.2 / PHB'24 p.88): Uncanny Metabolism (L2) — on rolling
    // Initiative, regain all expended Focus once per long rest, plus heal
    // monk level + a Martial Arts die roll (the roll itself happens in the
    // impure rollInitiative op — resourceFn only declares the descriptor).
    // Perfect Focus (L15) layers on top: every combat, top Focus up to 4 when
    // at 3 or fewer. #1243 needs BOTH behaviors on this one pool at different
    // levels, hence the array. Deliberately UNCHANGED shape (no explicit
    // `threshold`, #1500's InitiativeRegen.threshold addition) — class-
    // features-snapshot.test.ts pins this exact byte shape for EDITION_2024,
    // and amount:4 alone already implies the identical remaining<4 trigger
    // (see regenTargetUsed) for an integer pool. 2014's Perfect Self below
    // DOES need `threshold` explicitly (0, not implied by any `amount`), so
    // that's where the new field earns its keep.
    const onInitiative: InitiativeRegen[] = [
      {
        id: "uncannyMetabolism",
        amount: "all",
        oncePerLongRest: true,
        bonusHeal: { sourceName: "Uncanny Metabolism", dieFaces: deriveMartialArtsDie(level, edition), flatBonus: level },
      },
    ];
    if (level >= 15) {
      onInitiative.push({ id: "perfectFocus", amount: 4 });
    }
    return [
      {
        key,
        label: "Focus Points",
        total: level,
        recharge: "short-or-long",
        onInitiative,
        description: `Fuel focus features: Flurry of Blows (1 focus), Patient Defense (free, or 1 focus for more), Step of the Wind (free, or 1 focus for more), and subclass abilities. Focus save DC ${saveDC}. Regain all focus on a short or long rest.`,
      },
    ];
  },
  subclasses: {
    "warrior of the open hand": {
      slug: "monk-warrior-of-the-open-hand",
      grantLevel: 3,
      // Wholeness of Body (SRD 5.2): uses = Wisdom modifier (min 1), not the
      // 2014 flat 1-use/long-rest shape — needs abilityScores, unlike the
      // level-only 2014 formula.
      resourceFn: (level, abilityScores) => {
        if (level < 6) return [];
        const wisMod = Math.max(1, abilityModifier(abilityScores.wisdom ?? 10));
        return [
          {
            key: "wholenessOfBody",
            label: "Wholeness of Body",
            total: wisMod,
            recharge: "longRest",
            description: `Bonus action: roll your Martial Arts die and regain that many HP plus your Wisdom modifier (minimum 1). ${wisMod} use(s) per long rest.`,
          },
        ];
      },
    },
    "warrior of shadow": {
      slug: "monk-warrior-of-shadow",
      grantLevel: 3,
      // Shadow Arts (L3) / Cloak of Shadows (L17, moved from 11 in the 2024
      // rewrite #1246) gates live as DERIVED_ACTIONS rows (actions.ts) rather
      // than deriveExtras booleans — one shared level-gate registry for every
      // monk action instead of a second copy here (#1315).
    },
    "warrior of the elements": {
      slug: "monk-warrior-of-the-elements",
      grantLevel: 3,
      // Elemental Attunement (L3) / Elemental Burst (L6) gates live as
      // DERIVED_ACTIONS rows (actions.ts) rather than deriveExtras booleans
      // (#1315). The save DC for both is the monk's focus save DC (surfaced
      // via the Focus pool), so no separate DC field is derived here.
    },
    "warrior of mercy": {
      slug: "monk-warrior-of-mercy",
      grantLevel: 3,
      // Hand of Harm / Hand of Healing (L3) spend the base Focus pool directly
      // — no dedicated pool (#1248). Flurry of Healing and Harm (L11) and Hand
      // of Ultimate Mercy (L17) are their own long-rest pools, spent via the
      // generic /resources/transactions endpoint like any other class pool;
      // hand-of-harm.ts's `freeFromFlurry` flag is the only bespoke wiring
      // that draws from flurryOfHealingAndHarm instead of focus.
      resourceFn: (level, abilityScores) => {
        const pools: DerivedResource[] = [];
        if (level >= 11) {
          const wisMod = Math.max(1, abilityModifier(abilityScores.wisdom ?? 10));
          pools.push({
            key: "flurryOfHealingAndHarm",
            label: "Flurry of Healing and Harm",
            total: wisMod,
            recharge: "longRest",
            description: `During Flurry of Blows, replace each unarmed strike with Hand of Healing and apply Hand of Harm without spending focus. ${wisMod} use(s) per long rest.`,
          });
        }
        if (level >= 17) {
          pools.push({
            key: "handOfUltimateMercy",
            label: "Hand of Ultimate Mercy",
            total: 1,
            recharge: "longRest",
            description:
              "Magic action, 5 focus: touch a creature dead no more than 24 hours to return it to life with 4d10 + Wisdom modifier hit points, ending Blinded, Deafened, Paralyzed, Poisoned, and Stunned. Once per long rest.",
          });
        }
        return pools;
      },
    },
  },
};
