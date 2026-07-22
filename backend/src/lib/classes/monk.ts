import { abilityModifier, deriveMartialArtsDie } from "@/lib/srd/srd.js";

import type { ClassDefinition, DerivedFeature, DerivedResource, InitiativeRegen } from "./types.js";

// Focus save DC (Monk) — used by Stunning Strike (live-play automation lives in
// stunning-strike.ts, which imports this), focus features, and Warrior of the
// Elements (Elemental Burst / Elemental Strikes force this DC). Exported so it's
// the single copy of the formula (SRD 5.2).
export function focusSaveDC(abilityScores: Record<string, number>, profBonus: number): number {
  return 8 + profBonus + abilityModifier(abilityScores.wisdom ?? 10);
}

const MONK_FEATURES: DerivedFeature[] = [
  {
    name: "Unarmored Defense",
    level: 1,
    source: "class",
    description:
      "While not wearing armor or wielding a shield, your AC equals 10 + your Dexterity modifier + your Wisdom modifier.",
  },
  {
    name: "Martial Arts",
    level: 1,
    source: "class",
    description:
      "With unarmed strikes or monk weapons: use Dexterity instead of Strength for attack and damage rolls; deal 1d6 (L1–4), 1d8 (L5–10), 1d10 (L11–16), or 1d12 (L17+) damage; make one bonus unarmed strike after the Attack action.",
  },
  {
    name: "Focus",
    level: 2,
    source: "class",
    description:
      "You have a pool of Focus Points equal to your monk level. Spend them to fuel: Flurry of Blows (1 focus — two bonus unarmed strikes), Patient Defense (free for Disengage as a bonus action, or 1 focus for Disengage + Dodge), Step of the Wind (free for Dash as a bonus action, or 1 focus for Disengage + Dash with jump distance doubled). Focus save DC = 8 + proficiency + Wisdom modifier. Regain all focus on a short or long rest.",
  },
  {
    name: "Unarmored Movement",
    level: 2,
    source: "class",
    description:
      "Your speed increases by 10 ft while unarmored and unshielded (+15 at L6; +20 at L10; +25 at L14; +30 at L18). At level 9, you can run up vertical surfaces and across liquids on your turn.",
  },
  {
    name: "Uncanny Metabolism",
    level: 2,
    source: "class",
    description:
      "When you roll initiative, you can regain all expended Focus Points; when you do, roll your Martial Arts die and regain hit points equal to your monk level plus the number rolled. Usable once per long rest.",
  },
  {
    name: "Deflect Attacks",
    level: 3,
    source: "class",
    description:
      "Use your reaction to reduce bludgeoning, piercing, or slashing damage from a melee or ranged attack that hits you by 1d10 + Dexterity modifier + monk level. If this reduces the damage to 0, spend 1 focus to redirect it: the attacker (melee, within 5 ft) or another creature (ranged, within 60 ft) must succeed on a Dexterity save or take damage equal to two rolls of your Martial Arts die + your Dexterity modifier.",
  },
  {
    name: "Slow Fall",
    level: 4,
    source: "class",
    description:
      "Use your reaction to reduce falling damage by 5 × your monk level.",
  },
  {
    name: "Extra Attack",
    level: 5,
    source: "class",
    description: "You can attack twice whenever you take the Attack action on your turn.",
  },
  {
    name: "Stunning Strike",
    level: 5,
    source: "class",
    description:
      "Once per turn when you hit with a monk weapon or unarmed strike, spend 1 focus to attempt a stunning strike. The target makes a Constitution save (focus save DC): on a failure it is stunned until the end of your next turn; on a success its speed is halved until the start of your next turn.",
  },
  {
    name: "Empowered Strikes",
    level: 6,
    source: "class",
    description:
      "Your unarmed strikes count as magical for the purpose of overcoming resistance and immunity to nonmagical attacks, and can deal force damage instead of their normal damage type.",
  },
  {
    name: "Evasion",
    level: 7,
    source: "class",
    description:
      "When subjected to an effect that allows a Dexterity save for half damage, you take no damage on a success and half damage on a failure.",
  },
  {
    name: "Heightened Focus",
    level: 10,
    source: "class",
    description:
      "Your focus features grow more potent: Flurry of Blows lets you make three unarmed strikes instead of two (still 1 focus); Patient Defense grants temporary hit points equal to two rolls of your Martial Arts die when you spend focus; Step of the Wind lets you bring one willing Large or smaller creature within 5 ft along with you when you spend focus.",
  },
  {
    name: "Self-Restoration",
    level: 10,
    source: "class",
    description:
      "At the end of each of your turns, you can end one Charmed, Frightened, or Poisoned effect on yourself for free. You also no longer suffer exhaustion from lack of food or water.",
  },
  {
    name: "Deflect Energy",
    level: 13,
    source: "class",
    description:
      "Your Deflect Attacks feature now works against an attack of any damage type, not just bludgeoning, piercing, or slashing.",
  },
  {
    name: "Disciplined Survivor",
    level: 14,
    source: "class",
    description:
      "You gain proficiency in all saving throws. Additionally, whenever you fail a saving throw, you can spend 1 focus to reroll it and take the second result.",
  },
  {
    name: "Perfect Focus",
    level: 15,
    source: "class",
    description:
      "When you roll initiative, if you have 3 or fewer focus points, you regain focus points until you have 4.",
  },
  {
    name: "Superior Defense",
    level: 18,
    source: "class",
    description:
      "At the start of your turn, spend 3 focus to bolster yourself for 1 minute or until you're incapacitated: during that time you have resistance to all damage except force damage.",
  },
  {
    name: "Body and Mind",
    level: 20,
    source: "class",
    description:
      "Your Dexterity and Wisdom scores each increase by 4, to a maximum of 25.",
  },
];

const WARRIOR_OF_THE_OPEN_HAND_FEATURES: DerivedFeature[] = [
  {
    name: "Open Hand Technique",
    level: 3,
    source: "subclass",
    description:
      "When you hit a creature with an attack granted by your Flurry of Blows, you can impose one effect: Addle — the creature can't take reactions until the start of its next turn (no save); Push — the creature makes a Strength save or is pushed up to 15 ft away; or Topple — the creature makes a Dexterity save or is knocked prone.",
  },
  {
    name: "Wholeness of Body",
    level: 6,
    source: "subclass",
    description:
      "As a bonus action, roll your Martial Arts die and regain that many hit points plus your Wisdom modifier (minimum 1). Usable a number of times equal to your Wisdom modifier (minimum once); regain all expended uses on a long rest.",
  },
  {
    name: "Fleet Step",
    level: 11,
    source: "subclass",
    description:
      "When you take a bonus action other than Step of the Wind, you can also take the Step of the Wind bonus action immediately afterward.",
  },
  {
    name: "Quivering Palm",
    level: 17,
    source: "subclass",
    description:
      "When you hit with an unarmed strike, spend 4 focus to set imperceptible vibrations in the creature that last for a number of days equal to your monk level. They are harmless unless you use your action to end them — the creature then makes a Constitution save, taking 10d12 force damage on a failure or half as much on a success. You can maintain vibrations in only one creature at a time and can end them harmlessly at any time without using an action.",
  },
];

// 2024 rewrite (SRD 5.2, #1246): Shadow Arts drops the 2014 flat-2-focus/4-spell
// menu for a single 1-focus Darkness cast + passive Minor Illusion/Darkvision
// grants; Cloak of Shadows moves 11 -> 17 (replacing Opportunist, retired —
// no 2024 equivalent) and Improved Shadow Step fills the vacated L11 slot.
const WARRIOR_OF_SHADOW_FEATURES: DerivedFeature[] = [
  {
    name: "Shadow Arts",
    level: 3,
    source: "subclass",
    description:
      "You know the Minor Illusion cantrip (Wisdom). Spend 1 focus to cast Darkness without material components; you can see through the darkness you create, and while it persists you can move it up to 30 ft as a bonus action. You also have Darkvision out to 60 ft, or your Darkvision's range increases by 60 ft if you already have it.",
  },
  {
    name: "Shadow Step",
    level: 6,
    source: "subclass",
    description:
      "While in dim light or darkness, teleport as a bonus action to an unoccupied space you can see that is also in dim light or darkness (up to 60 ft), then make one unarmed strike as part of the same bonus action. You have advantage on the first melee attack you make before the end of the turn.",
  },
  {
    name: "Improved Shadow Step",
    level: 11,
    source: "subclass",
    description:
      "When you Shadow Step, you can spend 1 focus to ignore the requirement that your destination be in dim light or darkness.",
  },
  {
    name: "Cloak of Shadows",
    level: 17,
    source: "subclass",
    description:
      "Spend 3 focus and use your action to become invisible and able to move through other creatures and objects as if they were difficult terrain, for 1 minute or until you're incapacitated. The invisibility ends early if you attack or cast a spell. While it lasts, Flurry of Blows costs no focus.",
  },
];

// Warrior of Mercy (PHB'24 p.92 — not in SRD 5.2, gap-fill content, #1248).
// None of these features call for a saving throw: Hand of Harm/Hand of
// Healing/Hand of Ultimate Mercy are touch effects that land automatically
// (see hand-of-harm.ts / hand-of-ultimate-mercy.ts for the live-play
// automation of the two that spend Focus mid-combat; Hand of Healing runs
// through the generic actions.ts dispatch like Wholeness of Body). Implements
// of Mercy grants fixed (non-choice) proficiencies — like Disciplined
// Survivor's saving-throw proficiency above, it's feature text only; this
// app has no mechanism for a subclass to auto-add to the persisted skill/tool
// proficiency lists (those are chosen at creation).
const WARRIOR_OF_MERCY_FEATURES: DerivedFeature[] = [
  {
    name: "Implements of Mercy",
    level: 3,
    source: "subclass",
    description:
      "You gain proficiency in the Insight and Medicine skills and with the Herbalism Kit.",
  },
  {
    name: "Hand of Harm",
    level: 3,
    source: "subclass",
    description:
      "Once per turn when you hit a creature with an unarmed strike and deal damage, you can expend 1 focus to deal extra necrotic damage equal to one Martial Arts die plus your Wisdom modifier.",
  },
  {
    name: "Hand of Healing",
    level: 3,
    source: "subclass",
    description:
      "As a Magic action, expend 1 focus to touch a creature and restore hit points equal to one Martial Arts die plus your Wisdom modifier. When you use Flurry of Blows, you can replace one of its unarmed strikes with this effect without spending the extra focus for the heal — Flurry's own focus cost still applies.",
  },
  {
    name: "Physician's Touch",
    level: 6,
    source: "subclass",
    description:
      "Hand of Harm also inflicts the Poisoned condition on the target until the end of your next turn. Hand of Healing also ends one of the following conditions on the target: Blinded, Deafened, Paralyzed, Poisoned, or Stunned.",
  },
  {
    name: "Flurry of Healing and Harm",
    level: 11,
    source: "subclass",
    description:
      "When you use Flurry of Blows, you can replace each of its unarmed strikes with Hand of Healing, and you can apply Hand of Harm to one of its strikes without spending focus (Hand of Harm's once-per-turn limit still applies). Usable a number of times equal to your Wisdom modifier (minimum once) per long rest.",
  },
  {
    name: "Hand of Ultimate Mercy",
    level: 17,
    source: "subclass",
    description:
      "As a Magic action, expend 5 focus to touch a creature that died no more than 24 hours ago and return it to life with 4d10 plus your Wisdom modifier hit points, ending the Blinded, Deafened, Paralyzed, Poisoned, and Stunned conditions on it. Usable once per long rest.",
  },
];

// Warrior of the Elements (2024, PHB'24 p.90 / SRD 5.2) — the 2024 rebuild of
// the retired Way of the Four Elements. Four fixed features (no chosen
// abilities): Manipulate Elements + Elemental Attunement at L3, Elemental
// Burst at L6, Stride of the Elements at L11, and the Elemental Epitome capstone
// at L17. Elemental Attunement is modeled as a while-active buff + two Focus-
// spending session actions (toggle + Elemental Burst) — see warrior-of-elements.ts.
const WARRIOR_OF_THE_ELEMENTS_FEATURES: DerivedFeature[] = [
  {
    name: "Manipulate Elements",
    level: 3,
    source: "subclass",
    description:
      "You know the Elementalism cantrip. Wisdom is your spellcasting ability for it.",
  },
  {
    name: "Elemental Attunement",
    level: 3,
    source: "subclass",
    description:
      "At the start of your turn, you can expend 1 Focus Point (no action) to imbue yourself with elemental energy for 10 minutes (or until you're Incapacitated). While attuned: your Unarmed Strike reach increases by 10 ft; and once per Unarmed Strike hit you can deal Acid, Cold, Fire, Lightning, or Thunder damage instead of the normal type — when you do, you can force the target to make a Strength saving throw (your focus save DC), moving it up to 10 ft in a direction of your choice on a failure.",
  },
  {
    name: "Elemental Burst",
    level: 6,
    source: "subclass",
    description:
      "As a Magic action, you can expend 2 Focus Points to create a 20-foot-radius sphere of elemental energy centered on a point within 120 ft. Choose Acid, Cold, Fire, Lightning, or Thunder. Each creature in the sphere makes a Dexterity saving throw (your focus save DC), taking damage equal to three rolls of your Martial Arts die of the chosen type on a failure, or half as much on a success.",
  },
  {
    name: "Stride of the Elements",
    level: 11,
    source: "subclass",
    description:
      "While your Elemental Attunement is active, you have a Fly Speed and a Swim Speed each equal to your Speed.",
  },
  {
    name: "Elemental Epitome",
    level: 17,
    source: "subclass",
    description:
      "While your Elemental Attunement is active you gain: Resistance to Acid, Cold, Fire, Lightning, or Thunder damage (choose one at the start of each of your turns); Destructive Stride (when you use Step of the Wind, your Speed increases by 20 ft that turn, and the first creature you move within 5 ft of takes one roll of your Martial Arts die of your chosen resistance type); and Empowered Strikes (once per turn, one Unarmed Strike deals an extra Martial Arts die of your chosen resistance type on a hit).",
  },
];

export const monk: ClassDefinition = {
  features: MONK_FEATURES,
  resourceFn: (level, abilityScores, profBonus) => {
    if (level < 2) return [];
    const focusDC = focusSaveDC(abilityScores, profBonus);
    // Uncanny Metabolism (L2, SRD 5.2): on rolling Initiative, regain all
    // expended Focus once per long rest, plus heal monk level + a Martial Arts
    // die roll (the roll itself happens in the impure rollInitiative op —
    // resourceFn only declares the descriptor). Perfect Focus (L15) layers on
    // top: every combat, top Focus up to 4 when at 3 or fewer. #1243 needs BOTH
    // behaviors on this one pool at different levels, hence the array.
    const onInitiative: InitiativeRegen[] = [
      {
        id: "uncannyMetabolism",
        amount: "all",
        oncePerLongRest: true,
        bonusHeal: { sourceName: "Uncanny Metabolism", dieFaces: deriveMartialArtsDie(level), flatBonus: level },
      },
    ];
    if (level >= 15) {
      // "if you have 3 or fewer focus points, you regain focus points until you
      // have 4" — amount:4 already encodes the "3 or fewer" trigger (a pool
      // at/above the target is a no-op in applyInitiativeRegen), so no separate
      // threshold check is needed here.
      onInitiative.push({ id: "perfectFocus", amount: 4 });
    }
    return [
      {
        key: "focus",
        label: "Focus Points",
        total: level,
        recharge: "short-or-long",
        onInitiative,
        description: `Fuel focus features: Flurry of Blows (1 focus), Patient Defense (free, or 1 focus for more), Step of the Wind (free, or 1 focus for more), and subclass abilities. Focus save DC ${focusDC}. Regain all focus on a short or long rest.`,
      },
    ];
  },
  subclasses: {
    "warrior of the open hand": {
      grantLevel: 3,
      features: WARRIOR_OF_THE_OPEN_HAND_FEATURES,
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
      grantLevel: 3,
      features: WARRIOR_OF_SHADOW_FEATURES,
      deriveExtras: (level) => {
        const extras: { shadowArtsAvailable?: boolean; cloakOfShadowsAvailable?: boolean } = {};
        if (level >= 3) extras.shadowArtsAvailable = true;
        // Cloak of Shadows moved 11 -> 17 in the 2024 rewrite (#1246): L11 is now
        // Improved Shadow Step, a reminder-only Shadow Step upgrade with no gate
        // boolean of its own (mirrors Shadow Step itself).
        if (level >= 17) extras.cloakOfShadowsAvailable = true;
        return extras;
      },
    },
    "warrior of the elements": {
      grantLevel: 3,
      features: WARRIOR_OF_THE_ELEMENTS_FEATURES,
      // Gate flags for the two Focus-spending session actions (Elemental
      // Attunement toggle at L3, Elemental Burst at L6). The save DC for both is
      // the monk's focus save DC (surfaced via the Focus pool), so no separate
      // DC field is derived here.
      deriveExtras: (level) => {
        const extras: { elementalAttunementAvailable?: boolean; elementalBurstAvailable?: boolean } = {};
        if (level >= 3) extras.elementalAttunementAvailable = true;
        if (level >= 6) extras.elementalBurstAvailable = true;
        return extras;
      },
    },
    "warrior of mercy": {
      grantLevel: 3,
      features: WARRIOR_OF_MERCY_FEATURES,
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
