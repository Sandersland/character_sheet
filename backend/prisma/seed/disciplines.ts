// ── Elemental Discipline catalog ────────────────────────────────────────────
// The ~17 PHB Way of the Four Elements disciplines. Seeded by unique name; the
// GET /api/disciplines picker fetches these. Each carries its min monk level, an
// embedded ki AbilityCost (costKind "pool"/"none"), and an EffectSpec (flat
// columns mirroring Spell). saveAbility doubles as the discipline's DC ability.
// Elemental Attunement is alwaysKnown (free, uncapped).
export interface DisciplineSeed {
  name: string;
  description: string;
  minLevel: number;
  alwaysKnown?: boolean;
  saveAbility?: string;
  costKind?: "none" | "pool";
  costPoolKey?: string;
  costBase?: number;
  costPerStep?: number;
  effectKind?: "damage" | "heal";
  effectDiceCount?: number;
  effectDiceFaces?: number;
  damageType?: string;
  attackType?: "attack" | "save";
  saveEffect?: "half" | "none";
}

export const DISCIPLINES: DisciplineSeed[] = [
  {
    name: "Elemental Attunement",
    minLevel: 3,
    alwaysKnown: true,
    costKind: "none",
    description:
      "As an action, briefly control elemental forces nearby: create a harmless sensory effect, light or snuff a small flame, chill or warm up to 1 pound of nonliving material, or shape an earth/fire/water/mist object no larger than 1 foot. Every Four Elements monk knows this discipline for free.",
  },
  {
    name: "Fangs of the Fire Snake",
    minLevel: 3,
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 1,
    costPerStep: 1,
    effectKind: "damage",
    effectDiceCount: 1,
    effectDiceFaces: 10,
    damageType: "fire",
    attackType: "attack",
    description:
      "When you use the Attack action, spend 1 ki to extend your reach by 10 ft this turn; a hit deals fire damage instead and an extra 1d10 fire (plus 1d10 per additional ki spent).",
  },
  {
    name: "Fist of Four Thunders",
    minLevel: 3,
    saveAbility: "constitution",
    saveEffect: "half",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 2,
    effectKind: "damage",
    effectDiceCount: 3,
    effectDiceFaces: 8,
    damageType: "thunder",
    attackType: "save",
    description: "Spend 2 ki to cast Thunderwave (3d8 thunder, Con save for half and no push).",
  },
  {
    name: "Fist of Unbroken Air",
    minLevel: 3,
    saveAbility: "strength",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 2,
    costPerStep: 1,
    effectKind: "damage",
    effectDiceCount: 3,
    effectDiceFaces: 10,
    damageType: "bludgeoning",
    attackType: "save",
    description:
      "Spend 2 ki: a creature within 30 ft makes a Str save or takes 3d10 bludgeoning (plus 1d10 per extra ki), is pushed 20 ft, and knocked prone.",
  },
  {
    name: "Rush of the Gale Spirits",
    minLevel: 3,
    saveAbility: "strength",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 2,
    description: "Spend 2 ki to cast Gust of Wind (a 60-ft line of strong wind, Str save to resist).",
  },
  {
    name: "Shape the Flowing River",
    minLevel: 3,
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 1,
    description:
      "Spend 1 ki to freeze, melt, or reshape an area of water or ice up to 30 ft on a side within 120 ft, and optionally move it up to 5 ft.",
  },
  {
    name: "Sweeping Cinder Strike",
    minLevel: 3,
    saveAbility: "dexterity",
    saveEffect: "half",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 2,
    costPerStep: 1,
    effectKind: "damage",
    effectDiceCount: 3,
    effectDiceFaces: 6,
    damageType: "fire",
    attackType: "save",
    description: "Spend 2 ki to cast Burning Hands (3d6 fire in a 15-ft cone, Dex save for half; +1d6 per extra ki).",
  },
  {
    name: "Water Whip",
    minLevel: 3,
    saveAbility: "dexterity",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 2,
    costPerStep: 1,
    effectKind: "damage",
    effectDiceCount: 3,
    effectDiceFaces: 10,
    damageType: "bludgeoning",
    attackType: "save",
    description:
      "Spend 2 ki: a creature within 30 ft makes a Dex save or takes 3d10 bludgeoning (plus 1d10 per extra ki) and is pulled 25 ft toward you or knocked prone.",
  },
  {
    name: "Clench of the North Wind",
    minLevel: 6,
    saveAbility: "wisdom",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 3,
    description: "Spend 3 ki to cast Hold Person (paralyze a humanoid, Wis save).",
  },
  {
    name: "Gong of the Summit",
    minLevel: 6,
    saveAbility: "constitution",
    saveEffect: "half",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 3,
    costPerStep: 1,
    effectKind: "damage",
    effectDiceCount: 3,
    effectDiceFaces: 8,
    damageType: "thunder",
    attackType: "save",
    description: "Spend 3 ki to cast Shatter (3d8 thunder, Con save for half; +1d8 per extra ki).",
  },
  {
    name: "Flames of the Phoenix",
    minLevel: 11,
    saveAbility: "dexterity",
    saveEffect: "half",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 4,
    costPerStep: 1,
    effectKind: "damage",
    effectDiceCount: 8,
    effectDiceFaces: 6,
    damageType: "fire",
    attackType: "save",
    description: "Spend 4 ki to cast Fireball (8d6 fire, Dex save for half; +1d6 per extra ki).",
  },
  {
    name: "Mist Stance",
    minLevel: 11,
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 4,
    description: "Spend 4 ki to cast Gaseous Form on yourself.",
  },
  {
    name: "Ride the Wind",
    minLevel: 11,
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 4,
    description: "Spend 4 ki to cast Fly on yourself.",
  },
  {
    name: "Breath of Winter",
    minLevel: 17,
    saveAbility: "constitution",
    saveEffect: "half",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 6,
    effectKind: "damage",
    effectDiceCount: 8,
    effectDiceFaces: 8,
    damageType: "cold",
    attackType: "save",
    description: "Spend 6 ki to cast Cone of Cold (8d8 cold in a 60-ft cone, Con save for half).",
  },
  {
    name: "Eternal Mountain Defense",
    minLevel: 17,
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 5,
    description: "Spend 5 ki to cast Stoneskin on yourself.",
  },
  {
    name: "River of Hungry Flame",
    minLevel: 17,
    saveAbility: "dexterity",
    saveEffect: "half",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 5,
    effectKind: "damage",
    effectDiceCount: 5,
    effectDiceFaces: 8,
    damageType: "fire",
    attackType: "save",
    description: "Spend 5 ki to cast Wall of Fire (5d8 fire, Dex save for half).",
  },
  {
    name: "Wave of Rolling Earth",
    minLevel: 17,
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 6,
    description: "Spend 6 ki to cast Wall of Stone.",
  },
];
