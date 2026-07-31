// --- Barbarian ClassFeature rows, authored as LITERAL data (#1223) ---------
// Commit 1 of 3 (mirrors Fighter's pilot, #1227/#1528/#1532): a behaviour-
// neutral mechanical move only. Barbarian's rows no longer derive from
// lib/classes/barbarian.ts's AuthoredFeature[] arrays at seed time —
// transcribed directly here, once, in their final DB-row shape. NO rules
// content is authored or changed by this commit: every row below is a
// byte-identical copy of what barbarian.ts's BARBARIAN_FEATURES/
// TOTEM_WARRIOR_FEATURES/BERSERKER_FEATURES said before this migration
// (pinned by barbarian-2014-snapshot.test.ts and proven equal by
// barbarian-features-migration.test.ts's byte-identity test). Authoring real
// 2024-specific text is commit 2's job; deleting lib/classes/barbarian.ts
// once nothing depends on it is commit 3's. class-features.ts concatenates
// BARBARIAN_FEATURES onto the still-derived classes' rows to build
// CLASS_FEATURES; see its LITERAL_ROW_CLASSES export for the set of classes
// whose rows tests must not compare against a TS-array "old" side.
//
// DATA MODULE ONLY (#1277 AC 4, scripts/check-seed-data-modules.sh): no
// direct database calls or async write logic may live in this file. expand()
// below is pure content assembly, not seeding logic.
//
// EDITION RULE: `edition` omitted -> expand() seeds ONE row per edition with
// IDENTICAL text — every row below is untagged, since barbarian.ts's
// AuthoredFeature entries never set `edition` (SRD 5.1 and SRD 5.2 agree on
// every Barbarian feature's text at this stage; a genuine 2024 fork is
// commit 2's content to author, not this commit's).
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { SeedEdition } from "./edition.js";
import type { ClassFeatureSeedRow } from "./class-features.js";

// Guards a stray subclass-slug typo below at import time, same intent as
// classFeatureSeedSchema's z.enum(SUBCLASS_SLUGS) — cheaper than a zod parse
// for a fixed, tiny, module-local list (mirrors fighter-features.ts's slug()).
function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`barbarian-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawBarbarianFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  /** Omitted -> identical text seeded for both editions (see file header). */
  edition?: SeedEdition;
  // #1530 carryover: the base class's L5 "Extra Attack" row is the only row
  // this commit populates a descriptor column on — it was already set on
  // barbarian.ts's AuthoredFeature entry (class-features.ts's expandFeatureRow
  // read it from there before this migration), so dropping it here would be a
  // silent regression in deriveAttacksPerAction, not a neutral move. Every
  // other row leaves this undefined — no other Barbarian feature has this
  // axis.
  derivedStat?: string;
  derivedStatTiers?: { minLevel: number; value: number | string }[];
}

function expand(raw: RawBarbarianFeature): ClassFeatureSeedRow[] {
  const base: Omit<ClassFeatureSeedRow, "edition"> = {
    className: "Barbarian",
    subclassSlug: raw.subclassSlug,
    name: raw.name,
    level: raw.level,
    description: raw.description,
    derivedStat: raw.derivedStat,
    derivedStatTiers: raw.derivedStatTiers,
  };
  const editions: SeedEdition[] = raw.edition ? [raw.edition] : ["EDITION_2014", "EDITION_2024"];
  return editions.map((edition) => ({ ...base, edition }));
}

// ---- Base class — SRD 5.1 / SRD 5.2 Barbarian ------------------------------
// 12 rows, all untagged (both editions byte-identical) — see file header.
const BARBARIAN_BASE_RAW: RawBarbarianFeature[] = [
  {
    subclassSlug: null,
    name: "Rage",
    level: 1,
    description:
      "As a bonus action, enter a rage lasting up to 1 minute. You gain advantage on Strength checks and saves, a bonus to melee damage (+2 at L1; +3 at L9; +4 at L16), and resistance to bludgeoning, piercing, and slashing damage. You can't cast or concentrate on spells while raging.",
  },
  {
    subclassSlug: null,
    name: "Unarmored Defense",
    level: 1,
    description: "While not wearing armor, your AC equals 10 + your Dexterity modifier + your Constitution modifier. You may use a shield.",
  },
  {
    subclassSlug: null,
    name: "Reckless Attack",
    level: 2,
    description:
      "When making your first attack on your turn, you may attack recklessly: you have advantage on melee weapon attack rolls using Strength this turn, but attack rolls against you also have advantage until your next turn.",
  },
  {
    subclassSlug: null,
    name: "Danger Sense",
    level: 2,
    description:
      "You have advantage on Dexterity saving throws against effects that you can see, such as traps and spells. Doesn't apply when blinded, deafened, or incapacitated.",
  },
  {
    subclassSlug: null,
    name: "Extra Attack",
    level: 5,
    description: "You can attack twice whenever you take the Attack action on your turn.",
    // Edition-invariant (SRD 5.1 / SRD 5.2 Barbarian, Extra Attack) — one flat
    // tier, no further scaling at higher levels (unlike Fighter). Carried over
    // verbatim from barbarian.ts's AuthoredFeature entry (#1530) — see this
    // interface's own comment for why dropping it would regress
    // deriveAttacksPerAction.
    derivedStat: "attacksPerAction",
    derivedStatTiers: [{ minLevel: 5, value: 2 }],
  },
  {
    subclassSlug: null,
    name: "Fast Movement",
    level: 5,
    description: "Your speed increases by 10 feet while you aren't wearing heavy armor.",
  },
  {
    subclassSlug: null,
    name: "Feral Instinct",
    level: 7,
    description:
      "You have advantage on initiative rolls. If surprised at the start of combat, you can still act normally on your first turn if you enter your rage before doing anything else.",
  },
  {
    subclassSlug: null,
    name: "Brutal Critical",
    level: 9,
    description: "You can roll one additional weapon damage die on a critical hit with a melee attack. Two extra dice at level 13, three at level 17.",
  },
  {
    subclassSlug: null,
    name: "Relentless Rage",
    level: 11,
    description:
      "When reduced to 0 HP while raging without dying outright, make a DC 10 Con save (DC +5 each use; resets on a short or long rest) to drop to 1 HP instead.",
  },
  {
    subclassSlug: null,
    name: "Persistent Rage",
    level: 15,
    description: "Your rage ends early only if you fall unconscious or choose to end it.",
  },
  {
    subclassSlug: null,
    name: "Indomitable Might",
    level: 18,
    description: "If your total for a Strength check is less than your Strength score, you can use that score in place of the total.",
  },
  {
    subclassSlug: null,
    name: "Primal Champion",
    level: 20,
    description: "Your Strength and Constitution scores each increase by 4, and their maximums become 24.",
  },
];

// ---- Path of the Totem Warrior ---------------------------------------------
// 5 rows, all untagged.
const TOTEM_WARRIOR_SLUG = slug("barbarian-totem-warrior");
const TOTEM_WARRIOR_RAW: RawBarbarianFeature[] = [
  {
    subclassSlug: TOTEM_WARRIOR_SLUG,
    name: "Spirit Seeker",
    level: 3,
    description: "Gain the ability to cast Beast Sense and Speak with Animals as rituals.",
  },
  {
    subclassSlug: TOTEM_WARRIOR_SLUG,
    name: "Totem Spirit",
    level: 3,
    description:
      "Choose a totem animal and gain a benefit while raging. Bear: resistance to all damage except psychic. Eagle: Disengage/Dash as a bonus action; can't be opportunity attacked except by flying creatures. Wolf: allies have advantage on melee attacks against creatures within 5 ft of you.",
  },
  {
    subclassSlug: TOTEM_WARRIOR_SLUG,
    name: "Aspect of the Beast",
    level: 6,
    description:
      "Gain a magical benefit from a second totem animal (can be the same or different). Bear: carry twice the weight; advantage on Strength checks. Eagle: see up to 1 mile clearly, dim light as bright. Wolf: hunt with a group; allies can't be tracked when traveling.",
  },
  {
    subclassSlug: TOTEM_WARRIOR_SLUG,
    name: "Spirit Walker",
    level: 10,
    description: "Cast the Commune with Nature spell as a ritual.",
  },
  {
    subclassSlug: TOTEM_WARRIOR_SLUG,
    name: "Totemic Attunement",
    level: 14,
    description:
      "Gain a benefit from a third totem animal while raging. Bear: threatening presence — enemies within 5 ft have disadvantage on attacks against non-you targets. Eagle: fly speed equal to walking speed. Wolf: knock prone when you hit with melee attack as a bonus action.",
  },
];

// ---- Path of the Berserker --------------------------------------------------
// 4 rows, all untagged.
const BERSERKER_SLUG = slug("barbarian-berserker");
const BERSERKER_RAW: RawBarbarianFeature[] = [
  {
    subclassSlug: BERSERKER_SLUG,
    name: "Frenzy",
    level: 3,
    description:
      "When you rage, choose to go into a frenzy. For the rage's duration, make one melee weapon attack as a bonus action on each of your turns. When the rage ends, you suffer one level of exhaustion.",
  },
  {
    subclassSlug: BERSERKER_SLUG,
    name: "Mindless Rage",
    level: 6,
    description: "You can't be charmed or frightened while raging. If charmed or frightened when you rage, the effect is suspended for the duration.",
  },
  {
    subclassSlug: BERSERKER_SLUG,
    name: "Intimidating Presence",
    level: 10,
    description:
      "As an action, frighten one creature within 30 ft that can see and hear you. It must succeed on a Wisdom save (DC 8 + proficiency + Charisma modifier) or be frightened until the end of your next turn. On a success, the target is immune to this feature for 24 hours.",
  },
  {
    subclassSlug: BERSERKER_SLUG,
    name: "Retaliation",
    level: 14,
    description: "When you take damage from a creature within 5 ft, use your reaction to make one melee weapon attack against that creature.",
  },
];

export const BARBARIAN_FEATURES: ClassFeatureSeedRow[] = [...BARBARIAN_BASE_RAW, ...TOTEM_WARRIOR_RAW, ...BERSERKER_RAW].flatMap(expand);
