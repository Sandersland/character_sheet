// PHB'14 pp. 80-81 — Way of the Four Elements is not in SRD 5.1, so every description below is transcribed from PHB'14, not the SRD.
// Each row is a GrantedAbility (source "discipline") consumed by the generic subclass-choice picker (GET /api/subclass-choices/discipline) and disciplineCastSteps.
// 16 rows, not 17: Elemental Attunement (PHB'14 p.80's free, always-known, uncapped discipline) is a DerivedFeature plus a DERIVED_ACTIONS reminder, never a catalog row a player picks or forgets.
// The per-cast ki cap (min(6, 2 + floor((monkLevel-1)/4)) -> 2/3/4/5/6 at L3/L5/L9/L13/L17) is enforced by maxKiPerDiscipline, not here — this module is a pure content array only.
// costBase for every spell-equivalent discipline is exactly one more than the underlying spell's level (Thunderwave 1st -> 2 ki ... Cone of Cold 5th -> 6 ki) — PHB'14 p.80's own worked example ("spend 3 ki points to cast [Burning Hands] as a 2nd-level spell" from Sweeping Cinder Strike's 2-ki base).
// costPerStep is set only where the discipline's own text allows spending extra ki to add damage dice (Fangs of the Fire Snake, Fist of Unbroken Air, Water Whip, Gong of the Summit, Sweeping Cinder Strike) — the others cast a spell at a fixed level with no upcast option.
import type { SeedEdition } from "./edition.js";

export interface DisciplineSeed {
  name: string;
  description: string;
  minLevel: number;
  alwaysKnown?: boolean;
  edition: SeedEdition;
  costKind: "pool" | "none";
  costPoolKey?: string;
  costBase?: number;
  costPerStep?: number;
  effectKind?: "damage";
  effectDiceCount?: number;
  effectDiceFaces?: number;
  damageType?: string;
  attackType?: "attack" | "save";
  saveAbility?: string;
  saveEffect?: "half";
}

export const DISCIPLINES: DisciplineSeed[] = [
  {
    name: "Fangs of the Fire Snake",
    minLevel: 3,
    edition: "EDITION_2014",
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
      "When you use the Attack action on your turn, spend 1 ki to cause your unarmed strikes to deal fire damage instead of bludgeoning and extend your reach by 10 ft for that action. When you hit with one, spend 1 ki to deal an extra 1d10 fire damage (plus 1d10 per additional ki spent, up to your per-cast ki cap). PHB'14 p.81.",
  },
  {
    name: "Fist of Four Thunders",
    minLevel: 3,
    edition: "EDITION_2014",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 2,
    effectKind: "damage",
    effectDiceCount: 2,
    effectDiceFaces: 8,
    damageType: "thunder",
    attackType: "save",
    saveAbility: "constitution",
    saveEffect: "half",
    description:
      "Spend 2 ki to cast thunderwave: each creature in a 15-ft cube from you makes a Constitution save, taking 2d8 thunder damage and being pushed 10 ft on a failure, half damage and no push on a success. PHB'14 p.81.",
  },
  {
    name: "Fist of Unbroken Air",
    minLevel: 3,
    edition: "EDITION_2014",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 2,
    costPerStep: 1,
    effectKind: "damage",
    effectDiceCount: 3,
    effectDiceFaces: 10,
    damageType: "bludgeoning",
    attackType: "save",
    saveAbility: "strength",
    saveEffect: "half",
    description:
      "As an action, spend 2 ki: choose a creature within 30 ft. It makes a Strength save, taking 3d10 bludgeoning damage (plus 1d10 per additional ki spent, up to your per-cast ki cap), being pushed 20 ft away, and knocked prone on a failure; on a success it takes half damage and suffers neither push nor prone. PHB'14 p.81.",
  },
  {
    name: "Rush of the Gale Spirits",
    minLevel: 3,
    edition: "EDITION_2014",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 2,
    saveAbility: "strength",
    description:
      "Spend 2 ki to cast gust of wind: a 60-ft line of strong wind blows from you for up to 1 minute (concentration); each creature that starts its turn in the line makes a Strength save or is pushed 15 ft away. PHB'14 p.81.",
  },
  {
    name: "Shape the Flowing River",
    minLevel: 3,
    edition: "EDITION_2014",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 1,
    description:
      "As an action, spend 1 ki to freeze, melt, or otherwise reshape an area of water or ice up to 30 ft on a side within 120 ft, changing its depth, shape, or transparency, and optionally move it up to 5 ft. This can't damage a creature or object. PHB'14 p.81.",
  },
  {
    name: "Sweeping Cinder Strike",
    minLevel: 3,
    edition: "EDITION_2014",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 2,
    costPerStep: 1,
    effectKind: "damage",
    effectDiceCount: 3,
    effectDiceFaces: 6,
    damageType: "fire",
    attackType: "save",
    saveAbility: "dexterity",
    saveEffect: "half",
    description:
      "Spend 2 ki to cast burning hands: each creature in a 15-ft cone makes a Dexterity save, taking 3d6 fire damage (plus 1d6 per additional ki spent, up to your per-cast ki cap) on a failure, half on a success. PHB'14 p.81.",
  },
  {
    name: "Water Whip",
    minLevel: 3,
    edition: "EDITION_2014",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 2,
    costPerStep: 1,
    effectKind: "damage",
    effectDiceCount: 3,
    effectDiceFaces: 10,
    damageType: "bludgeoning",
    attackType: "save",
    saveAbility: "dexterity",
    saveEffect: "half",
    description:
      "As an action, spend 2 ki: choose a creature you can see within 30 ft. It makes a Dexterity save, taking 3d10 bludgeoning damage (plus 1d10 per additional ki spent, up to your per-cast ki cap) and — your choice — being knocked prone or pulled up to 25 ft toward you on a failure; on a success it takes half damage and suffers neither. PHB'14 p.81.",
  },
  {
    name: "Clench of the North Wind",
    minLevel: 6,
    edition: "EDITION_2014",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 3,
    saveAbility: "wisdom",
    description:
      "Spend 3 ki to cast hold person (no higher-level upcast): one humanoid within range makes a Wisdom save (repeating it at the end of each of its turns) or is paralyzed for up to 1 minute (concentration). PHB'14 p.81.",
  },
  {
    name: "Gong of the Summit",
    minLevel: 6,
    edition: "EDITION_2014",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 3,
    costPerStep: 1,
    effectKind: "damage",
    effectDiceCount: 3,
    effectDiceFaces: 8,
    damageType: "thunder",
    attackType: "save",
    saveAbility: "constitution",
    saveEffect: "half",
    description:
      "Spend 3 ki to cast shatter: each creature in a 10-ft-radius sphere makes a Constitution save, taking 3d8 thunder damage (plus 1d8 per additional ki spent, up to your per-cast ki cap) on a failure, half on a success. PHB'14 p.81.",
  },
  {
    name: "Mist Stance",
    minLevel: 11,
    edition: "EDITION_2014",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 4,
    description:
      "Spend 4 ki to cast gaseous form on yourself, becoming a misty cloud for up to 1 hour (concentration). PHB'14 p.81.",
  },
  {
    name: "Ride the Wind",
    minLevel: 11,
    edition: "EDITION_2014",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 4,
    description:
      "Spend 4 ki to cast fly on yourself, gaining a 60-ft flying speed for up to 10 minutes (concentration). PHB'14 p.81.",
  },
  {
    name: "Flames of the Phoenix",
    minLevel: 11,
    edition: "EDITION_2014",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 4,
    effectKind: "damage",
    effectDiceCount: 8,
    effectDiceFaces: 6,
    damageType: "fire",
    attackType: "save",
    saveAbility: "dexterity",
    saveEffect: "half",
    description:
      "Spend 4 ki to cast fireball: each creature in a 20-ft-radius sphere within 150 ft makes a Dexterity save, taking 8d6 fire damage on a failure, half on a success. PHB'14 p.81.",
  },
  {
    name: "Breath of Winter",
    minLevel: 17,
    edition: "EDITION_2014",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 6,
    effectKind: "damage",
    effectDiceCount: 8,
    effectDiceFaces: 8,
    damageType: "cold",
    attackType: "save",
    saveAbility: "constitution",
    saveEffect: "half",
    description:
      "Spend 6 ki to cast cone of cold: each creature in a 60-ft cone makes a Constitution save, taking 8d8 cold damage on a failure, half on a success. PHB'14 p.81.",
  },
  {
    name: "Eternal Mountain Defense",
    minLevel: 13,
    edition: "EDITION_2014",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 5,
    description:
      // Offered among the 11th-level tier's picks, but PHB'14's own text states the 13th-level gate directly: its 5-ki cost isn't payable until level 13 (PHB'14 p.80's Elemental Disciplines table caps a single cast at 4 ki through level 12).
      "You must be at least a 13th-level monk to use this discipline. Spend 5 ki to cast stoneskin on yourself, resisting nonmagical bludgeoning, piercing, and slashing damage for up to 1 hour (concentration). PHB'14 p.81.",
  },
  {
    name: "River of Hungry Flame",
    minLevel: 17,
    edition: "EDITION_2014",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 5,
    effectKind: "damage",
    effectDiceCount: 5,
    effectDiceFaces: 8,
    damageType: "fire",
    attackType: "save",
    saveAbility: "dexterity",
    saveEffect: "half",
    description:
      "Spend 5 ki to cast wall of fire: a wall of flame up to 1 minute (concentration) deals 5d8 fire damage to a creature on entering or ending its turn there (Dexterity save for half). PHB'14 p.81.",
  },
  {
    name: "Wave of Rolling Earth",
    minLevel: 17,
    edition: "EDITION_2014",
    costKind: "pool",
    costPoolKey: "ki",
    costBase: 6,
    description:
      "Spend 6 ki to cast wall of stone, raising a solid wall of rock for up to 10 minutes (concentration) unless made permanent. PHB'14 p.81.",
  },
];
