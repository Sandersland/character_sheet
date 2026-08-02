// --- Cleric ClassFeature rows, authored as LITERAL data (#1225) ------------
// Commit 1 of 3 (mirrors Barbarian's #1223 / Warlock's #1233 / Wizard's #1234)
// moves these rows off lib/classes/cleric.ts's AuthoredFeature[] arrays into
// literal seed data, byte-identical to the old TS-derived text (pinned by
// cleric-2014-snapshot.test.ts). Commit 2 will author Cleric's REAL SRD 5.2
// (2024) content for the base class and Life Domain, plus Trickery Domain's
// PHB'24 content (mirror-sourced per an owner decision — Trickery is not in
// SRD 5.2 — see this file's own commit-2 citations once landed). Commit 3
// will move the Channel Divinity resource pool onto its two carrier rows and
// shrink lib/classes/cleric.ts to its irreducible residue.
// class-features.ts concatenates CLERIC_FEATURES onto the still-derived
// classes' rows to build CLASS_FEATURES; see its LITERAL_ROW_CLASSES export
// for the set of classes whose rows tests must not compare against a
// TS-array "old" side.
//
// DATA MODULE ONLY (#1277 AC 4, scripts/check-seed-data-modules.sh): no
// direct database calls or async write logic may live in this file. expand()
// below is pure content assembly, not seeding logic.
//
// EDITION RULE (mirrors fighter-features.ts/barbarian-features.ts/
// warlock-features.ts): `edition` omitted -> expand() seeds ONE row per
// edition with IDENTICAL text — reserved for a feature genuinely
// edition-invariant in both mechanics AND wording. `edition` set -> exactly
// the one row named. Every EDITION_2014 row below stays byte-identical to
// what this commit pins (cleric-2014-snapshot.test.ts) — later commits only
// ever ADD an `edition: "EDITION_2024"` tag alongside new 2024 text; they
// never edit a 2014 row's own name/level/description.
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { SeedEdition } from "./edition.js";
import type { ClassFeatureSeedRow } from "./class-features.js";

// Guards a stray subclass-slug typo below at import time, same intent as
// classFeatureSeedSchema's z.enum(SUBCLASS_SLUGS) — cheaper than a zod parse
// for a fixed, tiny, module-local list (mirrors barbarian-features.ts's/
// warlock-features.ts's slug()).
function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`cleric-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawClericFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  /** Omitted -> identical text seeded for both editions (see file header). */
  edition?: SeedEdition;
  // Resource-pool descriptor columns (#1225 commit 3) — populated on Cleric's
  // two Channel Divinity carrier rows only once commit 3 lands.
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: string;
  resourceTotals?: { minLevel: number; total: number; shortRestRegain?: number }[];
}

function expand(raw: RawClericFeature): ClassFeatureSeedRow[] {
  const base: Omit<ClassFeatureSeedRow, "edition"> = {
    className: "Cleric",
    subclassSlug: raw.subclassSlug,
    name: raw.name,
    level: raw.level,
    description: raw.description,
    resourceKey: raw.resourceKey,
    resourceLabel: raw.resourceLabel,
    resourceRecharge: raw.resourceRecharge,
    resourceTotals: raw.resourceTotals,
  };
  const editions: SeedEdition[] = raw.edition ? [raw.edition] : ["EDITION_2014", "EDITION_2024"];
  return editions.map((edition) => ({ ...base, edition }));
}

// ---- Base class — PHB'14 p.57ff (2014) -------------------------------------
// 2014: 5 rows (byte-identical to the pre-migration tree /
// cleric-2014-snapshot.test.ts).
const CLERIC_BASE_RAW: RawClericFeature[] = [
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    description:
      "You cast spells using Wisdom. Full-caster progression. You prepare a number of cleric spells equal to your Wisdom modifier + your cleric level (minimum 1).",
  },
  {
    subclassSlug: null,
    name: "Channel Divinity: Turn Undead",
    level: 2,
    description:
      "As an action, each undead within 30 ft that can see or hear you must make a Wisdom save (DC 8 + proficiency + Wisdom modifier) or be turned for 1 minute. Turned undead flee you.",
  },
  {
    subclassSlug: null,
    name: "Destroy Undead",
    level: 5,
    description:
      "When you turn an undead, any with CR 1/2 or lower are instantly destroyed (CR 1 at L8; CR 2 at L11; CR 3 at L14; CR 4 at L17).",
  },
  {
    subclassSlug: null,
    name: "Divine Intervention",
    level: 10,
    description:
      "Call on your deity for aid. Roll percentile dice — on a result ≤ your cleric level, your deity intervenes. On a success, you can't use this feature again for 7 days. At level 20 it automatically succeeds.",
  },
  {
    subclassSlug: null,
    name: "Divine Intervention Improvement",
    level: 20,
    description: "Your Divine Intervention call automatically succeeds (no roll required).",
  },
];

// ---- Life Domain — PHB'14 p.59 (2014) --------------------------------------
// 2014: 7 rows (byte-identical to the pre-migration tree). The pre-existing
// #1374 fork (Domain Spells' lowest tier: L1 in 2014, L3 in 2024) survives
// this commit unedited — its 2024 row is retired in commit 2, once the real
// SRD 5.2 Life Domain Spells table replaces this placeholder text.
const LIFE_DOMAIN_SLUG = slug("cleric-life-domain");
const LIFE_DOMAIN_RAW: RawClericFeature[] = [
  {
    subclassSlug: LIFE_DOMAIN_SLUG,
    name: "Domain Spells",
    level: 1,
    edition: "EDITION_2024",
    description:
      "Always-prepared domain spells (they don't count against your prepared total): Bless, Cure Wounds (L3); Lesser Restoration, Spiritual Weapon (L3); Beacon of Hope, Revivify (L5); Death Ward, Guardian of Faith (L7); Mass Cure Wounds, Raise Dead (L9).",
  },
  {
    subclassSlug: LIFE_DOMAIN_SLUG,
    name: "Domain Spells",
    level: 1,
    edition: "EDITION_2014",
    // SRD 5.1, "Life Domain" (Life Domain Spells table) — openly licensed,
    // independently verifiable. Identical to the row above but for the first
    // tier's label (L3 -> L1), matching PHB'14's actual gate.
    description:
      "Always-prepared domain spells (they don't count against your prepared total): Bless, Cure Wounds (L1); Lesser Restoration, Spiritual Weapon (L3); Beacon of Hope, Revivify (L5); Death Ward, Guardian of Faith (L7); Mass Cure Wounds, Raise Dead (L9).",
  },
  {
    subclassSlug: LIFE_DOMAIN_SLUG,
    name: "Bonus Proficiency",
    level: 1,
    description: "You gain proficiency with heavy armor.",
  },
  {
    subclassSlug: LIFE_DOMAIN_SLUG,
    name: "Disciple of Life",
    level: 1,
    description:
      "Whenever you use a spell of 1st level or higher to restore hit points to a creature, the creature regains additional HP equal to 2 + the spell's level.",
  },
  {
    subclassSlug: LIFE_DOMAIN_SLUG,
    name: "Channel Divinity: Preserve Life",
    level: 2,
    description:
      "As an action, evoke healing energy that restores a total of 5× your cleric level HP, divided among creatures within 30 ft (up to half their maximum HP each). Uses the Channel Divinity pool.",
  },
  {
    subclassSlug: LIFE_DOMAIN_SLUG,
    name: "Blessed Healer",
    level: 6,
    description:
      "When you cast a healing spell of 1st level or higher that restores HP to another creature, you regain HP equal to 2 + the spell's level.",
  },
  {
    subclassSlug: LIFE_DOMAIN_SLUG,
    name: "Divine Strike",
    level: 8,
    description: "Once per turn when you hit with a weapon, deal an extra 1d8 radiant damage (+2d8 at level 14).",
  },
  {
    subclassSlug: LIFE_DOMAIN_SLUG,
    name: "Supreme Healing",
    level: 17,
    description: "When you would normally roll dice to restore HP with a spell, use the highest number possible instead of rolling.",
  },
];

// ---- Trickery Domain — PHB'14 p.63 (2014) ----------------------------------
// 2014: 6 rows (byte-identical to the pre-migration tree). Same #1374 Domain
// Spells fork as Life Domain above.
const TRICKERY_DOMAIN_SLUG = slug("cleric-trickery-domain");
const TRICKERY_DOMAIN_RAW: RawClericFeature[] = [
  {
    subclassSlug: TRICKERY_DOMAIN_SLUG,
    name: "Domain Spells",
    level: 1,
    edition: "EDITION_2024",
    description:
      "Always-prepared domain spells (they don't count against your prepared total): Charm Person, Disguise Self (L3); Mirror Image, Pass without Trace (L3); Blink, Dispel Magic (L5); Dimension Door, Polymorph (L7); Dominate Person, Modify Memory (L9).",
  },
  {
    subclassSlug: TRICKERY_DOMAIN_SLUG,
    name: "Domain Spells",
    level: 1,
    edition: "EDITION_2014",
    // PHB'14, "Trickery Domain" — Trickery Domain Spells. Page number
    // deliberately omitted — could not be verified from a licensed source
    // (see PR description).
    description:
      "Always-prepared domain spells (they don't count against your prepared total): Charm Person, Disguise Self (L1); Mirror Image, Pass without Trace (L3); Blink, Dispel Magic (L5); Dimension Door, Polymorph (L7); Dominate Person, Modify Memory (L9).",
  },
  {
    subclassSlug: TRICKERY_DOMAIN_SLUG,
    name: "Blessing of the Trickster",
    level: 1,
    description:
      "As an action, touch a willing creature to give it advantage on Dexterity (Stealth) checks. Lasts 1 hour or until you use this feature again.",
  },
  {
    subclassSlug: TRICKERY_DOMAIN_SLUG,
    name: "Channel Divinity: Invoke Duplicity",
    level: 2,
    description:
      "As an action, create an illusory duplicate of yourself within 30 ft that lasts for 1 minute (concentration). You can attack with advantage against a creature within 5 ft of the duplicate, and can cast spells as if from the duplicate's space. Uses the Channel Divinity pool.",
  },
  {
    subclassSlug: TRICKERY_DOMAIN_SLUG,
    name: "Channel Divinity: Cloak of Shadows",
    level: 6,
    description: "As an action, become invisible until the end of your next turn. Uses the Channel Divinity pool.",
  },
  {
    subclassSlug: TRICKERY_DOMAIN_SLUG,
    name: "Divine Strike",
    level: 8,
    description: "Once per turn when you hit with a weapon, deal an extra 1d8 poison damage (+2d8 at level 14).",
  },
  {
    subclassSlug: TRICKERY_DOMAIN_SLUG,
    name: "Improved Duplicity",
    level: 17,
    description:
      "When you use Invoke Duplicity, you can create up to four duplicates instead of one. As a bonus action on your turn, move any number of them up to 30 ft (no more than 120 ft away from you).",
  },
];

export const CLERIC_FEATURES: ClassFeatureSeedRow[] = [...CLERIC_BASE_RAW, ...LIFE_DOMAIN_RAW, ...TRICKERY_DOMAIN_RAW].flatMap(expand);
