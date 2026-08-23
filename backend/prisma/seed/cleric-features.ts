// Cleric ClassFeature rows, authored as literal seed data. Base class and
// Life Domain are transcribed from SRD 5.2 (Cleric pp.36-40). Trickery Domain
// is not in SRD 5.2; its 2024 text is mirror-sourced from two independent
// secondary sources that agree on every mechanic below.
//
// DATA MODULE ONLY (scripts/check-seed-data-modules.sh): no direct database
// calls or async write logic may live in this file.
//
// `edition` omitted on a row -> expand() seeds one row per edition with
// identical text; `edition` set -> exactly the one row named. A "no 2024
// successor" feature means NOT authoring a 2024 row for that name, never
// deleting the 2014 row — a rename gets a new row instead of an edit in place.
//
// Exactly ONE row per edition may set resourceKey: "channelDivinity" — two
// would both be pushed by poolsFromRows and silently "max"-merged by
// registry.ts's SHARED_POOL_MERGE instead of erroring. 2014's pool rides the
// existing "Channel Divinity: Turn Undead" row (no separate 2014 "Channel
// Divinity" row exists); 2024's pool rides the new 2024 "Channel Divinity" row.
//
// saveDcAbilities is deliberately unset on every row below: Cleric already
// serves its Channel Divinity DC through channelDivinitySaveDC
// (lib/classes/channel-divinity.ts) / ChannelDivinitySection.tsx, and
// announcedSaveDC is a single scalar that a Cleric/Battle-Master multiclass
// would collide on.
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { FeatImprovement } from "../../src/lib/classes/resources-state.js";
import type { SeedEdition } from "./edition.js";
import type { ClassFeatureSeedRow } from "./class-features.js";

// Guards a stray subclass-slug typo below at import time.
function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`cleric-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawClericFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  edition: SeedEdition;
  // Only Turn Undead's EDITION_2014 row and Channel Divinity's EDITION_2024 row set these.
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: string;
  resourceTotals?: { minLevel: number; total: number; shortRestRegain?: number }[];
  // A passive, always-on grant — only Life Domain's 2014 "Bonus Proficiency" row sets this.
  improvements?: FeatImprovement[];
  activationCost?: string;
  costKind?: string;
  costPoolKey?: string;
  costBase?: number;
  reminder?: string;
}

function expand(raw: RawClericFeature): ClassFeatureSeedRow[] {
  return [
    {
      className: "Cleric",
      subclassSlug: raw.subclassSlug,
      name: raw.name,
      level: raw.level,
      description: raw.description,
      edition: raw.edition,
      resourceKey: raw.resourceKey,
      resourceLabel: raw.resourceLabel,
      resourceRecharge: raw.resourceRecharge,
      resourceTotals: raw.resourceTotals,
      improvements: raw.improvements,
      activationCost: raw.activationCost,
      costKind: raw.costKind,
      costPoolKey: raw.costPoolKey,
      costBase: raw.costBase,
      reminder: raw.reminder,
    },
  ];
}

// ---- Base class — PHB'14 p.57ff (2014) / SRD 5.2 pp. 36-38 (2024) ---------
// 2014: 5 rows (byte-identical to commit 1 / cleric-2014-snapshot.test.ts).
// 2024: 11 rows — Destroy Undead and Divine Intervention Improvement each get
// a NEW-NAMED 2024 successor (Sear Undead, Greater Divine Intervention) so
// neither old name gets its own 2024 row; Divine Order/Channel Divinity/
// Channel Divinity: Divine Spark/Blessed Strikes/Improved Blessed
// Strikes/Epic Boon join as wholly new 2024 features.
const CLERIC_BASE_RAW: RawClericFeature[] = [
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2014",
    description:
      "You cast spells using Wisdom. Full-caster progression. You prepare a number of cleric spells equal to your Wisdom modifier + your cleric level (minimum 1).",
  },
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2 pp.36-37: replaces 2014's Wisdom-modifier formula with a flat, level-only Prepared Spells table.
    description:
      "You cast spells using Wisdom. You know three cantrips of your choice from the Cleric spell list, replacing one whenever you gain a Cleric level; you learn an additional cantrip at levels 4 and 10. You prepare a growing list of Cleric spells (4 at level 1, rising to 22 by level 20, per the Cleric Features table), regain all expended spell slots on a Long Rest, and can change your prepared list whenever you finish one. A Holy Symbol serves as your Spellcasting Focus.",
  },
  {
    subclassSlug: null,
    name: "Divine Order",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2 p.37. NEW in 2024 — no 2014 counterpart.
    description:
      "Choose a sacred role: Protector — proficiency with Martial weapons and training with Heavy armor — or Thaumaturge — learn one extra Cleric cantrip, and add your Wisdom modifier (minimum +1) to Arcana or Religion checks.",
  },
  {
    subclassSlug: null,
    name: "Channel Divinity",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2 p.37: Channel Divinity is now its own named feature, separate from its options.
    description:
      "You channel divine energy from the Outer Planes to fuel magical effects — Divine Spark and Turn Undead at 2nd level, more at higher levels. Each time you use it, choose which effect to create. You have 2 uses (3 at level 6, 4 at level 18). You regain one of its expended uses when you finish a Short Rest, and you regain all expended uses when you finish a Long Rest.",
    resourceKey: "channelDivinity",
    resourceLabel: "Channel Divinity",
    resourceRecharge: "longRest",
    resourceTotals: [
      { minLevel: 2, total: 2, shortRestRegain: 1 },
      { minLevel: 6, total: 3, shortRestRegain: 1 },
      { minLevel: 18, total: 4, shortRestRegain: 1 },
    ],
    // PHB'14 p.164: one feature, one pool, shared across both granting classes — same reminder text as paladin-features.ts's own Channel Divinity rows.
    activationCost: "action",
    costKind: "pool",
    costPoolKey: "channelDivinity",
    costBase: 1,
    reminder:
      "Spend 1 use for any Channel Divinity effect you have — a Cleric's Turn Undead and Divine Domain options and a Paladin's Oath options all draw on this one pool.",
  },
  {
    subclassSlug: null,
    name: "Channel Divinity: Divine Spark",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2 p.37. NEW in 2024 — no 2014 counterpart.
    description:
      "As a Magic action, point your Holy Symbol at a creature you can see within 30 ft and roll 1d8 plus your Wisdom modifier: either restore that many Hit Points to the creature, or force it to make a Constitution saving throw — on a failure it takes Necrotic or Radiant damage (your choice) equal to that total, half as much (round down) on a success. Roll an additional d8 at Cleric levels 7 (2d8), 13 (3d8), and 18 (4d8).",
  },
  {
    subclassSlug: null,
    name: "Channel Divinity: Turn Undead",
    level: 2,
    edition: "EDITION_2014",
    description:
      "As an action, each undead within 30 ft that can see or hear you must make a Wisdom save (DC 8 + proficiency + Wisdom modifier) or be turned for 1 minute. Turned undead flee you.",
    // The 2014 Channel Divinity pool carrier — no separate 2014 "Channel Divinity" row exists.
    resourceKey: "channelDivinity",
    resourceLabel: "Channel Divinity",
    resourceRecharge: "short-or-long",
    resourceTotals: [
      { minLevel: 2, total: 1 },
      { minLevel: 6, total: 2 },
      { minLevel: 18, total: 3 },
    ],
    // PHB'14 p.60: this row's actual feature name — the served card reads
    // "Channel Divinity: Turn Undead" for a solo 2014 Cleric, not the generic
    // "Channel Divinity" name 2024's carrier row above uses. A Cleric/Paladin
    // multiclass still gets exactly one merged card; which name shows follows primary-entry-wins dedupe.
    activationCost: "action",
    costKind: "pool",
    costPoolKey: "channelDivinity",
    costBase: 1,
    reminder:
      "Spend 1 use for any Channel Divinity effect you have — a Cleric's Turn Undead and Divine Domain options and a Paladin's Oath options all draw on this one pool.",
  },
  {
    subclassSlug: null,
    name: "Channel Divinity: Turn Undead",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2 p.37: targets "each Undead of your choice" and grants Frightened + Incapacitated, not a flee-only "turned" state.
    description:
      "As a Magic action, present your Holy Symbol; each Undead of your choice within 30 ft must succeed on a Wisdom saving throw or gain the Frightened and Incapacitated conditions for 1 minute, trying to move as far from you as it can on its turns. This effect ends early on the creature if it takes any damage, if you have the Incapacitated condition, or if you die.",
  },
  {
    subclassSlug: null,
    name: "Destroy Undead",
    level: 5,
    edition: "EDITION_2014",
    description:
      "When you turn an undead, any with CR 1/2 or lower are instantly destroyed (CR 1 at L8; CR 2 at L11; CR 3 at L14; CR 4 at L17).",
  },
  // Destroy Undead has NO EDITION_2024 row — replaced outright by Sear Undead below.
  {
    subclassSlug: null,
    name: "Sear Undead",
    level: 5,
    edition: "EDITION_2024",
    // SRD 5.2 p.37: rolls a number of d8s equal to Wisdom modifier, not a cleric-level tier table.
    description:
      "Whenever you use Turn Undead, roll a number of d8s equal to your Wisdom modifier (minimum 1d8) and add them together. Each Undead that fails its save against that use of Turn Undead takes Radiant damage equal to the total. This damage doesn't end the turn effect.",
  },
  {
    subclassSlug: null,
    name: "Blessed Strikes",
    level: 7,
    edition: "EDITION_2024",
    // SRD 5.2 p.38. NEW in 2024 — no 2014 counterpart.
    description:
      "Choose Divine Strike — once on each of your turns when you hit with a weapon, deal an extra 1d8 Necrotic or Radiant damage (your choice) — or Potent Spellcasting — add your Wisdom modifier to the damage of any Cleric cantrip. (If you already have an option of this name from an older-book subclass, use only the option you choose here.)",
  },
  {
    subclassSlug: null,
    name: "Divine Intervention",
    level: 10,
    edition: "EDITION_2014",
    description:
      "Call on your deity for aid. Roll percentile dice — on a result ≤ your cleric level, your deity intervenes. On a success, you can't use this feature again for 7 days. At level 20 it automatically succeeds.",
  },
  {
    subclassSlug: null,
    name: "Divine Intervention",
    level: 10,
    edition: "EDITION_2024",
    // SRD 5.2 p.38: guaranteed (no percentile roll), restricted to a spell that doesn't require a Reaction.
    description:
      "As a Magic action, choose any Cleric spell of level 5 or lower that doesn't require a Reaction to cast, and cast it as part of the same action without expending a spell slot or needing Material components. Usable once per Long Rest.",
  },
  {
    subclassSlug: null,
    name: "Improved Blessed Strikes",
    level: 14,
    edition: "EDITION_2024",
    // SRD 5.2 p.38. NEW in 2024 — no 2014 counterpart.
    description:
      "Your Blessed Strikes option grows stronger: Divine Strike's extra damage increases to 2d8; Potent Spellcasting lets you grant temporary Hit Points equal to twice your Wisdom modifier to yourself or another creature within 60 ft whenever a Cleric cantrip of yours deals damage.",
  },
  {
    subclassSlug: null,
    name: "Divine Intervention Improvement",
    level: 20,
    edition: "EDITION_2014",
    description: "Your Divine Intervention call automatically succeeds (no roll required).",
  },
  // Divine Intervention Improvement has NO EDITION_2024 row — replaced outright by Greater Divine Intervention below.
  {
    subclassSlug: null,
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    // SRD 5.2 p.38. Text only — the feat system itself is deferred.
    description: "You gain an Epic Boon feat of your choice (Boon of Fate recommended). You can take this feat only once.",
  },
  {
    subclassSlug: null,
    name: "Greater Divine Intervention",
    level: 20,
    edition: "EDITION_2024",
    // SRD 5.2 p.38.
    description:
      "When you use Divine Intervention, you can choose Wish as the spell. If you do, you can't use Divine Intervention again until you finish 2d4 Long Rests.",
  },
];

// ---- Life Domain — PHB'14 p.59 (2014) / SRD 5.2 pp. 39-40 (2024) ----------
// 2014: 7 rows (byte-identical to commit 1). 2024: 5 rows — Bonus
// Proficiency and Divine Strike get NO 2024 successor (heavy-armor training
// folds into Divine Order's Protector option; Divine Strike folds into the
// base class's own Blessed Strikes at L7).
const LIFE_DOMAIN_SLUG = slug("cleric-life-domain");
const LIFE_DOMAIN_RAW: RawClericFeature[] = [
  {
    subclassSlug: LIFE_DOMAIN_SLUG,
    name: "Domain Spells",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Always-prepared domain spells (they don't count against your prepared total): Bless, Cure Wounds (L1); Lesser Restoration, Spiritual Weapon (L3); Beacon of Hope, Revivify (L5); Death Ward, Guardian of Faith (L7); Mass Cure Wounds, Raise Dead (L9).",
  },
  // SRD 5.2 p.40's own Life Domain Spells table.
  {
    subclassSlug: LIFE_DOMAIN_SLUG,
    name: "Life Domain Spells",
    level: 3,
    edition: "EDITION_2024",
    description:
      "Always-prepared domain spells (they don't count against your prepared total): Aid, Bless, Cure Wounds, Lesser Restoration (L3); Mass Healing Word, Revivify (L5); Aura of Life, Death Ward (L7); Greater Restoration, Mass Cure Wounds (L9).",
  },
  {
    subclassSlug: LIFE_DOMAIN_SLUG,
    name: "Bonus Proficiency",
    level: 1,
    edition: "EDITION_2014",
    description: "You gain proficiency with heavy armor.",
    // PHB'14 p.59 grants heavy armor proficiency outright, no choice involved.
    improvements: [{ target: "armorProficiency", amount: 1, key: "heavy" }],
  },
  // Bonus Proficiency has NO EDITION_2024 row — Heavy armor training is now
  // Divine Order's Protector option (base class, any Cleric), not a Life
  // Domain grant.
  {
    subclassSlug: LIFE_DOMAIN_SLUG,
    name: "Disciple of Life",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Whenever you use a spell of 1st level or higher to restore hit points to a creature, the creature regains additional HP equal to 2 + the spell's level.",
  },
  {
    subclassSlug: LIFE_DOMAIN_SLUG,
    name: "Disciple of Life",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2 p.40: level-shifts 1 -> 3, keys the bonus off the spell SLOT's level, not the spell's own.
    description:
      "When a spell you cast with a spell slot restores Hit Points to a creature, that creature regains additional Hit Points on the turn you cast it, equal to 2 plus the spell slot's level.",
  },
  {
    subclassSlug: LIFE_DOMAIN_SLUG,
    name: "Channel Divinity: Preserve Life",
    level: 2,
    edition: "EDITION_2014",
    description:
      "As an action, evoke healing energy that restores a total of 5× your cleric level HP, divided among creatures within 30 ft (up to half their maximum HP each). Uses the Channel Divinity pool.",
  },
  {
    subclassSlug: LIFE_DOMAIN_SLUG,
    name: "Channel Divinity: Preserve Life",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2 p.40: level-shifts 2 -> 3, becomes a Magic action, restricts targets to Bloodied creatures.
    description:
      "As a Magic action, expend a use of Channel Divinity to evoke healing energy: restore a total of 5× your cleric level HP, divided among Bloodied creatures within 30 ft (which can include you), up to half each creature's HP maximum.",
  },
  {
    subclassSlug: LIFE_DOMAIN_SLUG,
    name: "Blessed Healer",
    level: 6,
    edition: "EDITION_2014",
    description:
      "When you cast a healing spell of 1st level or higher that restores HP to another creature, you regain HP equal to 2 + the spell's level.",
  },
  {
    subclassSlug: LIFE_DOMAIN_SLUG,
    name: "Blessed Healer",
    level: 6,
    edition: "EDITION_2024",
    // SRD 5.2 p.40: keyed off the spell SLOT's level, requires the healing come from a spell cast with a slot.
    description:
      "Immediately after you cast a spell with a spell slot that restores Hit Points to one or more creatures other than yourself, you regain Hit Points equal to 2 plus the spell slot's level.",
  },
  {
    subclassSlug: LIFE_DOMAIN_SLUG,
    name: "Divine Strike",
    level: 8,
    edition: "EDITION_2014",
    description: "Once per turn when you hit with a weapon, deal an extra 1d8 radiant damage (+2d8 at level 14).",
  },
  // Divine Strike has NO EDITION_2024 row — folded into the base class's own
  // Blessed Strikes (L7) / Improved Blessed Strikes (L14), which cover every
  // Cleric, not just Life Domain.
  {
    subclassSlug: LIFE_DOMAIN_SLUG,
    name: "Supreme Healing",
    level: 17,
    edition: "EDITION_2014",
    description: "When you would normally roll dice to restore HP with a spell, use the highest number possible instead of rolling.",
  },
  {
    subclassSlug: LIFE_DOMAIN_SLUG,
    name: "Supreme Healing",
    level: 17,
    edition: "EDITION_2024",
    // SRD 5.2 p.40: widens from "a spell" to "a spell or Channel Divinity" —
    // now also covers Preserve Life's healing.
    description:
      "When you would normally roll dice to restore Hit Points with a spell or Channel Divinity, use the highest number possible for each die instead of rolling.",
  },
];

// Trickery Domain — PHB'14 p.63 (2014) / PHB'24 pp.75-76 (2024, mirror-sourced).
const TRICKERY_DOMAIN_SLUG = slug("cleric-trickery-domain");
const TRICKERY_DOMAIN_RAW: RawClericFeature[] = [
  {
    subclassSlug: TRICKERY_DOMAIN_SLUG,
    name: "Domain Spells",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Always-prepared domain spells (they don't count against your prepared total): Charm Person, Disguise Self (L1); Mirror Image, Pass without Trace (L3); Blink, Dispel Magic (L5); Dimension Door, Polymorph (L7); Dominate Person, Modify Memory (L9).",
  },
  {
    subclassSlug: TRICKERY_DOMAIN_SLUG,
    name: "Trickery Domain Spells",
    level: 3,
    edition: "EDITION_2024",
    description:
      "Always-prepared domain spells (they don't count against your prepared total): Charm Person, Disguise Self, Invisibility, Pass without Trace (L3); Hypnotic Pattern, Nondetection (L5); Confusion, Dimension Door (L7); Dominate Person, Modify Memory (L9).",
  },
  {
    subclassSlug: TRICKERY_DOMAIN_SLUG,
    name: "Blessing of the Trickster",
    level: 1,
    edition: "EDITION_2014",
    description:
      "As an action, touch a willing creature to give it advantage on Dexterity (Stealth) checks. Lasts 1 hour or until you use this feature again.",
  },
  {
    subclassSlug: TRICKERY_DOMAIN_SLUG,
    name: "Blessing of the Trickster",
    level: 3,
    edition: "EDITION_2024",
    // Mirror-sourced: level-shifts 1 -> 3, becomes a Magic action, extends range to 30 ft, no longer requires touch.
    description:
      "As a Magic action, give yourself or a willing creature within 30 ft advantage on Dexterity (Stealth) checks. Lasts until you finish a Long Rest or you use this feature again.",
  },
  {
    subclassSlug: TRICKERY_DOMAIN_SLUG,
    name: "Channel Divinity: Invoke Duplicity",
    level: 2,
    edition: "EDITION_2014",
    description:
      "As an action, create an illusory duplicate of yourself within 30 ft that lasts for 1 minute (concentration). You can attack with advantage against a creature within 5 ft of the duplicate, and can cast spells as if from the duplicate's space. Uses the Channel Divinity pool.",
  },
  {
    subclassSlug: TRICKERY_DOMAIN_SLUG,
    name: "Channel Divinity: Invoke Duplicity",
    level: 3,
    edition: "EDITION_2024",
    // Mirror-sourced: level-shifts 2 -> 3, becomes a Bonus Action, drops
    // Concentration entirely. The 2014 text's move-range cap is deliberately
    // omitted — neither source confirmed it still applies in 2024.
    description:
      "As a Bonus Action, expend a use of Channel Divinity to create an illusory duplicate of yourself in an unoccupied space within 30 ft, lasting 1 minute (no Concentration required). You can cast spells as if from the duplicate's space, gain advantage on attack rolls against a creature within 5 ft of it, and use a Bonus Action to move it up to 30 ft.",
  },
  {
    subclassSlug: TRICKERY_DOMAIN_SLUG,
    name: "Channel Divinity: Cloak of Shadows",
    level: 6,
    edition: "EDITION_2014",
    description: "As an action, become invisible until the end of your next turn. Uses the Channel Divinity pool.",
  },
  // Channel Divinity: Cloak of Shadows has NO EDITION_2024 row — replaced
  // outright by Trickster's Transposition below (a different name and a
  // different mechanic: a teleport swap, not invisibility).
  {
    subclassSlug: TRICKERY_DOMAIN_SLUG,
    name: "Trickster's Transposition",
    level: 6,
    edition: "EDITION_2024",
    // Mirror-sourced (both sources agree): a NEW L6 feature, no 2014
    // counterpart — Cloak of Shadows' 2024 replacement.
    description: "Whenever you use a Bonus Action to create or move your Invoke Duplicity illusion, you can teleport, swapping places with it.",
  },
  {
    subclassSlug: TRICKERY_DOMAIN_SLUG,
    name: "Divine Strike",
    level: 8,
    edition: "EDITION_2014",
    description: "Once per turn when you hit with a weapon, deal an extra 1d8 poison damage (+2d8 at level 14).",
  },
  // Divine Strike has NO EDITION_2024 row — same fold-into-Blessed-Strikes
  // reasoning as Life Domain's own Divine Strike above.
  {
    subclassSlug: TRICKERY_DOMAIN_SLUG,
    name: "Improved Duplicity",
    level: 17,
    edition: "EDITION_2014",
    description:
      "When you use Invoke Duplicity, you can create up to four duplicates instead of one. As a bonus action on your turn, move any number of them up to 30 ft (no more than 120 ft away from you).",
  },
  {
    subclassSlug: TRICKERY_DOMAIN_SLUG,
    name: "Improved Duplicity",
    level: 17,
    edition: "EDITION_2024",
    // Mirror-sourced: the 2024 rework is NOT "up to four duplicates" — it
    // gains two named benefits on its one existing illusion instead.
    description:
      "Your Invoke Duplicity illusion gains two benefits: Shared Distraction — you and your allies have advantage on attack rolls against a creature within 5 ft of the illusion; Healing Illusion — when the illusion ends, you or a creature of your choice within 5 ft of it regains Hit Points equal to your Cleric level.",
  },
];

export const CLERIC_FEATURES: ClassFeatureSeedRow[] = [...CLERIC_BASE_RAW, ...LIFE_DOMAIN_RAW, ...TRICKERY_DOMAIN_RAW].flatMap(expand);
