// --- Monk ClassFeature rows, authored as LITERAL data (#1675) --------------
// The twelfth and last retab (#1134/#1522's roster completion): Monk's rows
// no longer derive from lib/classes/monk.ts's AuthoredFeature[] arrays —
// they are transcribed/authored directly here, once, in their final DB-row
// shape, following the fighter-features.ts pattern (#1227) every other class
// already moved to. class-features.ts concatenates MONK_FEATURES onto the
// other eleven classes' literal rows to build CLASS_FEATURES; see its
// LITERAL_ROW_CLASSES export for the set (now all twelve).
//
// DATA MODULE ONLY (#1277 AC 4, scripts/check-seed-data-modules.sh): no
// direct database calls or async write logic may live in this file.
// expand() below is pure content assembly, not seeding logic.
//
// SCOPE (#1675): TRANSPORT ONLY, zero behavior change. Every row below is a
// byte-identical transcription of what lib/classes/monk.ts's MONK_FEATURES /
// WARRIOR_OF_THE_OPEN_HAND_FEATURES / WARRIOR_OF_SHADOW_FEATURES /
// WARRIOR_OF_THE_ELEMENTS_FEATURES / WARRIOR_OF_MERCY_FEATURES said before
// this migration, expanded through class-features.ts's old expandFeatureRow
// (both editions get the same text — pinned by monk-2014-snapshot.test.ts's
// pre-change snapshot). The 2014 rewrite (real SRD 5.1/PHB'14 divergent
// text) is #1500-#1503's job, not this one — moving no pools either (monk.ts
// keeps its resourceFn for the ki/focus pool and every subclass resourceFn
// unchanged).
//
// Two rows carry descriptor columns, both already set on their source
// AuthoredFeature entries in monk.ts before this migration (#1530's Extra
// Attack tier, #1686's Elemental Attunement toggle block) — transcribed
// here unchanged, not new population:
//   - Extra Attack (base class, L5): derivedStat "attacksPerAction" with a
//     single flat tier (edition-invariant, SRD 5.1 / SRD 5.2 Monk).
//   - Elemental Attunement (Warrior of the Elements, L3): the toggle half
//     only (activationCost/resolverKind/resourceKey/costKind/costPoolKey/
//     costBase/effectBuffs) — Elemental Burst/Elemental Strike's own
//     save-DC damage mechanics stay in warrior-of-elements.ts, unchanged.
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { EffectBuffRow } from "../../src/lib/classes/class-feature-rows.js";
import type { SeedEdition } from "./edition.js";
import type { ClassFeatureSeedRow } from "./class-features.js";

// Guards a stray subclass-slug typo below at import time, same intent as
// classFeatureSeedSchema's z.enum(SUBCLASS_SLUGS) — cheaper than a zod parse
// for a fixed, tiny, module-local list. Mirrors fighter-features.ts's slug().
function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`monk-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawMonkFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  /** Omitted -> identical text seeded for both editions (see file header) — every row below omits it; the 2014 rewrite is #1500-#1503's job. */
  edition?: SeedEdition;
  // ---- Descriptor columns (#1530/#1686), transcribed unchanged from their
  // ---- source AuthoredFeature entries — see file header. Every other row
  // ---- leaves these undefined, which expand() passes straight through.
  derivedStat?: string;
  derivedStatTiers?: { minLevel: number; value: number | string }[];
  resourceKey?: string;
  activationCost?: string;
  resolverKind?: string;
  costKind?: string;
  costPoolKey?: string;
  costBase?: number;
  effectBuffs?: EffectBuffRow[];
}

function expand(raw: RawMonkFeature): ClassFeatureSeedRow[] {
  const base: Omit<ClassFeatureSeedRow, "edition"> = {
    className: "Monk",
    subclassSlug: raw.subclassSlug,
    name: raw.name,
    level: raw.level,
    description: raw.description,
    derivedStat: raw.derivedStat,
    derivedStatTiers: raw.derivedStatTiers,
    resourceKey: raw.resourceKey,
    activationCost: raw.activationCost,
    resolverKind: raw.resolverKind,
    costKind: raw.costKind,
    costPoolKey: raw.costPoolKey,
    costBase: raw.costBase,
    effectBuffs: raw.effectBuffs,
  };
  const editions: SeedEdition[] = raw.edition ? [raw.edition] : ["EDITION_2014", "EDITION_2024"];
  return editions.map((edition) => ({ ...base, edition }));
}

// ---- Base class — SRD 5.1 p. 46-49 (2014) / SRD 5.2 p.87-89 (2024) --------
// 18 rows, byte-identical across both editions (untagged — see file header).
const MONK_BASE_RAW: RawMonkFeature[] = [
  {
    subclassSlug: null,
    name: "Unarmored Defense",
    level: 1,
    description:
      "While not wearing armor or wielding a shield, your AC equals 10 + your Dexterity modifier + your Wisdom modifier.",
  },
  {
    subclassSlug: null,
    name: "Martial Arts",
    level: 1,
    description:
      "With unarmed strikes or monk weapons: use Dexterity instead of Strength for attack and damage rolls; deal 1d6 (L1–4), 1d8 (L5–10), 1d10 (L11–16), or 1d12 (L17+) damage; make one bonus unarmed strike after the Attack action.",
  },
  {
    subclassSlug: null,
    name: "Focus",
    level: 2,
    description:
      "You have a pool of Focus Points equal to your monk level. Spend them to fuel: Flurry of Blows (1 focus — two bonus unarmed strikes), Patient Defense (free for Disengage as a bonus action, or 1 focus for Disengage + Dodge), Step of the Wind (free for Dash as a bonus action, or 1 focus for Disengage + Dash with jump distance doubled). Focus save DC = 8 + proficiency + Wisdom modifier. Regain all focus on a short or long rest.",
  },
  {
    subclassSlug: null,
    name: "Unarmored Movement",
    level: 2,
    description:
      "Your speed increases by 10 ft while unarmored and unshielded (+15 at L6; +20 at L10; +25 at L14; +30 at L18). At level 9, you can run up vertical surfaces and across liquids on your turn.",
  },
  {
    subclassSlug: null,
    name: "Uncanny Metabolism",
    level: 2,
    description:
      "When you roll initiative, you can regain all expended Focus Points; when you do, roll your Martial Arts die and regain hit points equal to your monk level plus the number rolled. Usable once per long rest.",
  },
  {
    subclassSlug: null,
    name: "Deflect Attacks",
    level: 3,
    description:
      "Use your reaction to reduce bludgeoning, piercing, or slashing damage from a melee or ranged attack that hits you by 1d10 + Dexterity modifier + monk level. If this reduces the damage to 0, spend 1 focus to redirect it: the attacker (melee, within 5 ft) or another creature (ranged, within 60 ft) must succeed on a Dexterity save or take damage equal to two rolls of your Martial Arts die + your Dexterity modifier.",
  },
  {
    subclassSlug: null,
    name: "Slow Fall",
    level: 4,
    description: "Use your reaction to reduce falling damage by 5 × your monk level.",
  },
  {
    subclassSlug: null,
    name: "Extra Attack",
    level: 5,
    description: "You can attack twice whenever you take the Attack action on your turn.",
    // #1530: edition-invariant (SRD 5.1 / SRD 5.2 Monk, Extra Attack) — one
    // flat tier, no further scaling at higher levels (unlike Fighter).
    derivedStat: "attacksPerAction",
    derivedStatTiers: [{ minLevel: 5, value: 2 }],
  },
  {
    subclassSlug: null,
    name: "Stunning Strike",
    level: 5,
    description:
      "Once per turn when you hit with a monk weapon or unarmed strike, spend 1 focus to attempt a stunning strike. The target makes a Constitution save (focus save DC): on a failure it is stunned until the end of your next turn; on a success its speed is halved until the start of your next turn.",
  },
  {
    subclassSlug: null,
    name: "Empowered Strikes",
    level: 6,
    description:
      "Your unarmed strikes count as magical for the purpose of overcoming resistance and immunity to nonmagical attacks, and can deal force damage instead of their normal damage type.",
  },
  {
    subclassSlug: null,
    name: "Evasion",
    level: 7,
    description:
      "When subjected to an effect that allows a Dexterity save for half damage, you take no damage on a success and half damage on a failure.",
  },
  {
    subclassSlug: null,
    name: "Heightened Focus",
    level: 10,
    description:
      "Your focus features grow more potent: Flurry of Blows lets you make three unarmed strikes instead of two (still 1 focus); Patient Defense grants temporary hit points equal to two rolls of your Martial Arts die when you spend focus; Step of the Wind lets you bring one willing Large or smaller creature within 5 ft along with you when you spend focus.",
  },
  {
    subclassSlug: null,
    name: "Self-Restoration",
    level: 10,
    description:
      "At the end of each of your turns, you can end one Charmed, Frightened, or Poisoned effect on yourself for free. You also no longer suffer exhaustion from lack of food or water.",
  },
  {
    subclassSlug: null,
    name: "Deflect Energy",
    level: 13,
    description:
      "Your Deflect Attacks feature now works against an attack of any damage type, not just bludgeoning, piercing, or slashing.",
  },
  {
    subclassSlug: null,
    name: "Disciplined Survivor",
    level: 14,
    description:
      "You gain proficiency in all saving throws. Additionally, whenever you fail a saving throw, you can spend 1 focus to reroll it and take the second result.",
  },
  {
    subclassSlug: null,
    name: "Perfect Focus",
    level: 15,
    description:
      "When you roll initiative, if you have 3 or fewer focus points, you regain focus points until you have 4.",
  },
  {
    subclassSlug: null,
    name: "Superior Defense",
    level: 18,
    description:
      "At the start of your turn, spend 3 focus to bolster yourself for 1 minute or until you're incapacitated: during that time you have resistance to all damage except force damage.",
  },
  {
    subclassSlug: null,
    name: "Body and Mind",
    level: 20,
    description: "Your Dexterity and Wisdom scores each increase by 4, to a maximum of 25.",
  },
];

// ---- Warrior of the Open Hand — SRD 5.1 / SRD 5.2 p. 90 --------------------
const WARRIOR_OF_THE_OPEN_HAND_RAW: RawMonkFeature[] = [
  {
    subclassSlug: slug("monk-warrior-of-the-open-hand"),
    name: "Open Hand Technique",
    level: 3,
    description:
      "When you hit a creature with an attack granted by your Flurry of Blows, you can impose one effect: Addle — the creature can't take reactions until the start of its next turn (no save); Push — the creature makes a Strength save or is pushed up to 15 ft away; or Topple — the creature makes a Dexterity save or is knocked prone.",
  },
  {
    subclassSlug: slug("monk-warrior-of-the-open-hand"),
    name: "Wholeness of Body",
    level: 6,
    description:
      "As a bonus action, roll your Martial Arts die and regain that many hit points plus your Wisdom modifier (minimum 1). Usable a number of times equal to your Wisdom modifier (minimum once); regain all expended uses on a long rest.",
  },
  {
    subclassSlug: slug("monk-warrior-of-the-open-hand"),
    name: "Fleet Step",
    level: 11,
    description:
      "When you take a bonus action other than Step of the Wind, you can also take the Step of the Wind bonus action immediately afterward.",
  },
  {
    subclassSlug: slug("monk-warrior-of-the-open-hand"),
    name: "Quivering Palm",
    level: 17,
    description:
      "When you hit with an unarmed strike, spend 4 focus to set imperceptible vibrations in the creature that last for a number of days equal to your monk level. They are harmless unless you use your action to end them — the creature then makes a Constitution save, taking 10d12 force damage on a failure or half as much on a success. You can maintain vibrations in only one creature at a time and can end them harmlessly at any time without using an action.",
  },
];

// ---- Warrior of Shadow — 2024 rewrite (PHB'24 p.91, #1246) -----------------
// Shadow Arts drops the 2014 flat-2-focus/4-spell menu for a single 1-focus
// Darkness cast + passive Minor Illusion/Darkvision grants; Cloak of Shadows
// moves 11 -> 17 (replacing Opportunist, retired — no 2024 equivalent) and
// Improved Shadow Step fills the vacated L11 slot. Untagged here regardless
// — this migration seeds the pre-#1246-rewrite text for BOTH editions
// (byte-identical to today); the 2014 rewrite is #1500-#1503's job.
const WARRIOR_OF_SHADOW_RAW: RawMonkFeature[] = [
  {
    subclassSlug: slug("monk-warrior-of-shadow"),
    name: "Shadow Arts",
    level: 3,
    description:
      "You know the Minor Illusion cantrip (Wisdom). Spend 1 focus to cast Darkness without material components; you can see through the darkness you create, and while it persists you can move it up to 30 ft as a bonus action. You also have Darkvision out to 60 ft, or your Darkvision's range increases by 60 ft if you already have it.",
  },
  {
    subclassSlug: slug("monk-warrior-of-shadow"),
    name: "Shadow Step",
    level: 6,
    description:
      "While in dim light or darkness, teleport as a bonus action to an unoccupied space you can see that is also in dim light or darkness (up to 60 ft), then make one unarmed strike as part of the same bonus action. You have advantage on the first melee attack you make before the end of the turn.",
  },
  {
    subclassSlug: slug("monk-warrior-of-shadow"),
    name: "Improved Shadow Step",
    level: 11,
    description:
      "When you Shadow Step, you can spend 1 focus to ignore the requirement that your destination be in dim light or darkness.",
  },
  {
    subclassSlug: slug("monk-warrior-of-shadow"),
    name: "Cloak of Shadows",
    level: 17,
    description:
      "Spend 3 focus and use your action to become invisible and able to move through other creatures and objects as if they were difficult terrain, for 1 minute or until you're incapacitated. The invisibility ends early if you attack or cast a spell. While it lasts, Flurry of Blows costs no focus.",
  },
];

// ---- Warrior of Mercy — PHB'24 p.92 (not in SRD 5.2, gap-fill content, #1248) --
// None of these features call for a saving throw: Hand of Harm/Hand of
// Healing/Hand of Ultimate Mercy are touch effects that land automatically
// (see hand-of-harm.ts / hand-of-ultimate-mercy.ts for the live-play
// automation of the two that spend Focus mid-combat; Hand of Healing runs
// through the generic actions.ts dispatch like Wholeness of Body). Implements
// of Mercy grants fixed (non-choice) proficiencies — like Disciplined
// Survivor's saving-throw proficiency above, it's feature text only; this
// app has no mechanism for a subclass to auto-add to the persisted skill/tool
// proficiency lists (those are chosen at creation).
const WARRIOR_OF_MERCY_RAW: RawMonkFeature[] = [
  {
    subclassSlug: slug("monk-warrior-of-mercy"),
    name: "Implements of Mercy",
    level: 3,
    description: "You gain proficiency in the Insight and Medicine skills and with the Herbalism Kit.",
  },
  {
    subclassSlug: slug("monk-warrior-of-mercy"),
    name: "Hand of Harm",
    level: 3,
    description:
      "Once per turn when you hit a creature with an unarmed strike and deal damage, you can expend 1 focus to deal extra necrotic damage equal to one Martial Arts die plus your Wisdom modifier.",
  },
  {
    subclassSlug: slug("monk-warrior-of-mercy"),
    name: "Hand of Healing",
    level: 3,
    description:
      "As a Magic action, expend 1 focus to touch a creature and restore hit points equal to one Martial Arts die plus your Wisdom modifier. When you use Flurry of Blows, you can replace one of its unarmed strikes with this effect without spending the extra focus for the heal — Flurry's own focus cost still applies.",
  },
  {
    subclassSlug: slug("monk-warrior-of-mercy"),
    name: "Physician's Touch",
    level: 6,
    description:
      "Hand of Harm also inflicts the Poisoned condition on the target until the end of your next turn. Hand of Healing also ends one of the following conditions on the target: Blinded, Deafened, Paralyzed, Poisoned, or Stunned.",
  },
  {
    subclassSlug: slug("monk-warrior-of-mercy"),
    name: "Flurry of Healing and Harm",
    level: 11,
    description:
      "When you use Flurry of Blows, you can replace each of its unarmed strikes with Hand of Healing, and you can apply Hand of Harm to one of its strikes without spending focus (Hand of Harm's once-per-turn limit still applies). Usable a number of times equal to your Wisdom modifier (minimum once) per long rest.",
  },
  {
    subclassSlug: slug("monk-warrior-of-mercy"),
    name: "Hand of Ultimate Mercy",
    level: 17,
    description:
      "As a Magic action, expend 5 focus to touch a creature that died no more than 24 hours ago and return it to life with 4d10 plus your Wisdom modifier hit points, ending the Blinded, Deafened, Paralyzed, Poisoned, and Stunned conditions on it. Usable once per long rest.",
  },
];

// ---- Warrior of the Elements — 2024 rebuild of Way of the Four Elements ----
// (PHB'24 p.90). Four fixed features (no chosen abilities): Manipulate
// Elements + Elemental Attunement at L3, Elemental Burst at L6, Stride of
// the Elements at L11, and the Elemental Epitome capstone at L17. Elemental
// Attunement is modeled as a while-active buff + two Focus-spending session
// actions (toggle + Elemental Burst) — see warrior-of-elements.ts.
const WARRIOR_OF_THE_ELEMENTS_RAW: RawMonkFeature[] = [
  {
    subclassSlug: slug("monk-warrior-of-the-elements"),
    name: "Manipulate Elements",
    level: 3,
    description: "You know the Elementalism cantrip. Wisdom is your spellcasting ability for it.",
  },
  {
    subclassSlug: slug("monk-warrior-of-the-elements"),
    name: "Elemental Attunement",
    level: 3,
    description:
      "At the start of your turn, you can expend 1 Focus Point (no action) to imbue yourself with elemental energy for 10 minutes (or until you're Incapacitated). While attuned: your Unarmed Strike reach increases by 10 ft; and once per Unarmed Strike hit you can deal Acid, Cold, Fire, Lightning, or Thunder damage instead of the normal type — when you do, you can force the target to make a Strength saving throw (your focus save DC), moving it up to 10 ft in a direction of your choice on a failure.",
    // #1686: the TOGGLE half only — activating/ending the buff that gates
    // attunementActive() (warrior-of-elements.ts). Elemental Burst/Elemental
    // Strike's own damage-and-save mechanics stay in that file's dedicated
    // route (they're save-DC damage ops, not buffs). `resourceKey` here is
    // this toggle's own IDENTITY (activate key "elementalAttunement" / end
    // key "endElementalAttunement") — it has no resourceTotals of its own
    // because the ACTUAL spend is 1 use of the SHARED "focus" pool
    // (costPoolKey), not a dedicated per-feature pool. The marker-buff form
    // (modifier: 0, target === key) is state-tracking only: attunementActive()
    // reads the buff's PRESENCE, never its modifier value.
    resourceKey: "elementalAttunement",
    activationCost: "free",
    resolverKind: "toggle",
    costKind: "pool",
    costPoolKey: "focus",
    costBase: 1,
    effectBuffs: [
      {
        key: "elementalAttunement",
        target: "elementalAttunement",
        modifier: 0,
        duration: "while-active",
      },
    ],
  },
  {
    subclassSlug: slug("monk-warrior-of-the-elements"),
    name: "Elemental Burst",
    level: 6,
    description:
      "As a Magic action, you can expend 2 Focus Points to create a 20-foot-radius sphere of elemental energy centered on a point within 120 ft. Choose Acid, Cold, Fire, Lightning, or Thunder. Each creature in the sphere makes a Dexterity saving throw (your focus save DC), taking damage equal to three rolls of your Martial Arts die of the chosen type on a failure, or half as much on a success.",
  },
  {
    subclassSlug: slug("monk-warrior-of-the-elements"),
    name: "Stride of the Elements",
    level: 11,
    description: "While your Elemental Attunement is active, you have a Fly Speed and a Swim Speed each equal to your Speed.",
  },
  {
    subclassSlug: slug("monk-warrior-of-the-elements"),
    name: "Elemental Epitome",
    level: 17,
    description:
      "While your Elemental Attunement is active you gain: Resistance to Acid, Cold, Fire, Lightning, or Thunder damage (choose one at the start of each of your turns); Destructive Stride (when you use Step of the Wind, your Speed increases by 20 ft that turn, and the first creature you move within 5 ft of takes one roll of your Martial Arts die of your chosen resistance type); and Empowered Strikes (once per turn, one Unarmed Strike deals an extra Martial Arts die of your chosen resistance type on a hit).",
  },
];

// The full Monk seed family: base class (18 features) + four 2024 subclasses
// (4 + 4 + 6 + 5 = 19 features), 37 total, each expanded to both editions —
// 74 rows. Concatenated into class-features.ts's CLASS_FEATURES the same way
// every other literal class's export is.
export const MONK_FEATURES: ClassFeatureSeedRow[] = [
  ...MONK_BASE_RAW.flatMap(expand),
  ...WARRIOR_OF_THE_OPEN_HAND_RAW.flatMap(expand),
  ...WARRIOR_OF_SHADOW_RAW.flatMap(expand),
  ...WARRIOR_OF_MERCY_RAW.flatMap(expand),
  ...WARRIOR_OF_THE_ELEMENTS_RAW.flatMap(expand),
];
