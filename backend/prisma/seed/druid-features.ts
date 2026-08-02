// --- Druid ClassFeature rows, authored as LITERAL data (#1226) -------------
// Commit 1 of 3 (mirrors Barbarian's #1223 / Ranger's #1230 pilots) moves
// these rows off lib/classes/druid.ts's AuthoredFeature[] arrays into literal
// seed data, byte-identical to the old TS-derived text (pinned by
// druid-2014-snapshot.test.ts) — all 17 rows below are still UNTAGGED at this
// commit (`edition` omitted, expand() seeds an identical copy per edition),
// exactly reproducing today's behaviour where a 2024 Druid sees 2014 text.
// Commit 2 authors Druid's REAL SRD 5.2 (2024) content, transcribed from SRD
// 5.2's own raw text for the base class and Circle of the Land; Circle of
// the Moon is NOT in SRD 5.2 (owner decision: mirror-source it from two
// independent sources, dnd2024.wikidot.com and wastedwizardgames.com —
// validated against each other and against the Land subclass's byte-identical
// SRD text, see CIRCLE_OF_THE_MOON_RAW's own comment) — by tagging every row
// below EDITION_2014 and adding new EDITION_2024 rows alongside them. Commit 3
// SPLITS Wild Shape's pool: the EDITION_2024 row gets resourceTotals/
// shortRestRegain (SRD 5.2 restructures Wild Shape enough that the CR cap and
// duration are no longer computed values embedded in the description — see
// commit 2's WILD_SHAPE_2024 row for the three-axis re-evaluation), while the
// EDITION_2014 row stays exactly as it always has — its pool computed by
// lib/classes/druid.ts's resourceFn, which commit 3 leaves untouched.
// Moonlight Step's pool (Circle of the Moon, 2024) is a Wisdom-modifier
// formula and declares resourceKey but deliberately OMITS resourceTotals,
// same shape as ranger-features.ts's Tireless/Nature's Veil — its total is
// supplied by a small EDITION_2024-gated resourceFn on the subclass
// definition itself (lib/classes/druid.ts).
//
// class-features.ts concatenates DRUID_FEATURES onto the still-derived
// classes' rows to build CLASS_FEATURES; see its LITERAL_ROW_CLASSES export
// for the set of classes whose rows tests must not compare against a
// TS-array "old" side.
//
// DATA MODULE ONLY (#1277 AC 4, scripts/check-seed-data-modules.sh): no
// direct database calls or async write logic may live in this file. expand()
// below is pure content assembly, not seeding logic.
//
// EDITION RULE (mirrors barbarian-features.ts/ranger-features.ts): `edition`
// omitted -> expand() seeds ONE row per edition with IDENTICAL text. As of
// commit 2, EVERY row below sets an explicit `edition` — unlike Barbarian's
// Extra Attack/Fast Movement or Ranger's Extra Attack, no Druid feature is
// genuinely edition-invariant in both mechanics AND wording once transcribed
// (even Beast Spells, which keeps its core clause, tightens its Material-
// component exclusion in 2024). A "removed in 2024" feature (Bonus Cantrip,
// Land's Stride, Combat Wild Shape, Primal Strike, Elemental Wild Shape,
// Thousand Forms; Timeless Body folds into Archdruid rather than surviving as
// its own row) means NOT authoring a 2024 row for that name, never deleting
// the 2014 row; a rename (Circle Spells -> Circle of the Land Spells) is a
// wholly different row, never one edited in place; a level-shift (Natural
// Recovery 2->6, Circle Forms 2->3) is two rows with two `level` values.
// Every EDITION_2014 row below stays byte-identical to what commit 1 pinned
// (druid-2014-snapshot.test.ts) — commit 2 only ever ADDS an
// `edition: "EDITION_2014"` tag alongside new 2024 text; it never edits a
// 2014 row's own name/level/description.
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { SeedEdition } from "./edition.js";
import type { ClassFeatureSeedRow } from "./class-features.js";

// Guards a stray subclass-slug typo below at import time, same intent as
// classFeatureSeedSchema's z.enum(SUBCLASS_SLUGS) — cheaper than a zod parse
// for a fixed, tiny, module-local list (mirrors barbarian-features.ts's
// slug()).
function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`druid-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawDruidFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  /** Omitted -> identical text seeded for both editions (see file header). */
  edition?: SeedEdition;
  // Wild Shape's resource-pool descriptor columns (#1226 commit 3) — see this
  // file's own header for why only the EDITION_2024 Wild Shape row sets
  // resourceTotals, and the EDITION_2024 Moonlight Step row sets the other
  // three but deliberately omits it (Wisdom-modifier formula, stays in
  // druid.ts's subclass resourceFn).
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: string;
  resourceTotals?: { minLevel: number; total: number; shortRestRegain?: number }[];
}

function expand(raw: RawDruidFeature): ClassFeatureSeedRow[] {
  const base: Omit<ClassFeatureSeedRow, "edition"> = {
    className: "Druid",
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

// ---- Base class — SRD 5.1 Druid (2014) / SRD 5.2 Druid (2024) -------------
// 2014: 6 rows (byte-identical to commit 1 / druid-2014-snapshot.test.ts).
const DRUID_BASE_RAW: RawDruidFeature[] = [
  {
    subclassSlug: null,
    name: "Druidic",
    level: 1,
    description:
      "You know Druidic, the secret language of druids. You can speak it and leave hidden messages in natural surroundings.",
  },
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    description:
      "You cast spells using Wisdom. Full-caster progression. You prepare a number of druid spells equal to your Wisdom modifier + your druid level (minimum 1).",
  },
  {
    subclassSlug: null,
    name: "Wild Shape",
    level: 2,
    description:
      "As an action, transform into a beast you have seen. Max CR: 1/4 at L2 (no flying or swimming speed); 1/2 at L4 (no flying speed); 1 at L8. You retain your mental stats and class features but use the beast's physical stats. Lasts up to half your druid level in hours (minimum 1). Reverts when reduced to 0 HP.",
  },
  {
    subclassSlug: null,
    name: "Timeless Body",
    level: 18,
    description:
      "The primal magic you wield causes you to age more slowly. For every 10 years that pass, your body ages only 1 year.",
  },
  {
    subclassSlug: null,
    name: "Beast Spells",
    level: 18,
    description:
      "You can cast many druid spells in any shape you assume using Wild Shape. You can perform the somatic and verbal components of a druid spell while in beast form.",
  },
  {
    subclassSlug: null,
    name: "Archdruid",
    level: 20,
    description:
      "You can use your Wild Shape an unlimited number of times. Additionally, you can ignore the verbal and somatic components of your druid spells, as well as any material components lacking a cost.",
  },
];

// ---- Circle of the Land ----------------------------------------------------
// 2014: 6 rows (byte-identical to commit 1 / druid-2014-snapshot.test.ts).
const CIRCLE_OF_THE_LAND_SLUG = slug("druid-circle-of-the-land");
const CIRCLE_OF_THE_LAND_RAW: RawDruidFeature[] = [
  {
    subclassSlug: CIRCLE_OF_THE_LAND_SLUG,
    name: "Bonus Cantrip",
    level: 2,
    description: "You learn one additional druid cantrip of your choice.",
  },
  {
    subclassSlug: CIRCLE_OF_THE_LAND_SLUG,
    name: "Natural Recovery",
    level: 2,
    description:
      "Once per long rest during a short rest, choose expended spell slots to recover. The total levels of slots recovered can be up to half your druid level (rounded up, max 5th level).",
  },
  {
    subclassSlug: CIRCLE_OF_THE_LAND_SLUG,
    name: "Circle Spells",
    level: 3,
    description:
      "You gain access to additional spells based on your chosen terrain (arctic, coast, desert, forest, grassland, mountain, swamp, or Underdark). These spells are always prepared for you and don't count against your prepared spells.",
  },
  {
    subclassSlug: CIRCLE_OF_THE_LAND_SLUG,
    name: "Land's Stride",
    level: 6,
    description:
      "Moving through nonmagical difficult terrain costs no extra movement, and you can pass through nonmagical plants without being slowed. Advantage on saves against magically created or manipulated plants.",
  },
  {
    subclassSlug: CIRCLE_OF_THE_LAND_SLUG,
    name: "Nature's Ward",
    level: 10,
    description: "Immune to poison and disease. Elementals and fey can't charm or frighten you.",
  },
  {
    subclassSlug: CIRCLE_OF_THE_LAND_SLUG,
    name: "Nature's Sanctuary",
    level: 14,
    description:
      "When a beast or plant attacks you, it must make a Wisdom saving throw (DC 8 + proficiency + Wisdom modifier) or choose a different target. On a success, it is immune to this feature for 24 hours.",
  },
];

// ---- Circle of the Moon -----------------------------------------------------
// 2014: 5 rows (byte-identical to commit 1 / druid-2014-snapshot.test.ts).
const CIRCLE_OF_THE_MOON_SLUG = slug("druid-circle-of-the-moon");
const CIRCLE_OF_THE_MOON_RAW: RawDruidFeature[] = [
  {
    subclassSlug: CIRCLE_OF_THE_MOON_SLUG,
    name: "Combat Wild Shape",
    level: 2,
    description:
      "You can use Wild Shape as a bonus action. While transformed, you can expend a spell slot as a bonus action to regain 1d8 HP per level of the slot expended.",
  },
  {
    subclassSlug: CIRCLE_OF_THE_MOON_SLUG,
    name: "Circle Forms",
    level: 2,
    description:
      "You can use Wild Shape to transform into beasts with a challenge rating as high as 1 (instead of the base druid table). Starting at level 6, the max CR equals your druid level divided by 3 (rounded down, minimum 1).",
  },
  {
    subclassSlug: CIRCLE_OF_THE_MOON_SLUG,
    name: "Primal Strike",
    level: 6,
    description:
      "Your attacks while in beast form count as magical for the purpose of overcoming resistance and immunity to nonmagical attacks.",
  },
  {
    subclassSlug: CIRCLE_OF_THE_MOON_SLUG,
    name: "Elemental Wild Shape",
    level: 10,
    description: "Expend two uses of Wild Shape to transform into an air, earth, fire, or water elemental.",
  },
  {
    subclassSlug: CIRCLE_OF_THE_MOON_SLUG,
    name: "Thousand Forms",
    level: 14,
    description: "You can cast the Alter Self spell at will without expending a spell slot.",
  },
];

export const DRUID_FEATURES: ClassFeatureSeedRow[] = [...DRUID_BASE_RAW, ...CIRCLE_OF_THE_LAND_RAW, ...CIRCLE_OF_THE_MOON_RAW].flatMap(
  expand,
);
