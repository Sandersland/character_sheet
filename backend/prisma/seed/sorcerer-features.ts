// --- Sorcerer ClassFeature rows, authored as LITERAL data (#1232) ----------
// Commit 1 of 3 (mirrors Barbarian's #1223, Warlock's #1233, Wizard's #1234)
// moves these rows off lib/classes/sorcerer.ts's AuthoredFeature[] arrays
// into literal seed data, byte-identical to the old TS-derived text (pinned
// by sorcerer-2014-snapshot.test.ts). Commit 2 authors Sorcerer's REAL SRD
// 5.2 (2024) content for the base class and both subclasses. Commit 3 moves
// every movable resource pool onto its row and shrinks lib/classes/sorcerer.ts
// to its irreducible residue.
// class-features.ts concatenates SORCERER_FEATURES onto the still-derived
// classes' rows to build CLASS_FEATURES; see its LITERAL_ROW_CLASSES export
// for the set of classes whose rows tests must not compare against a
// TS-array "old" side.
//
// DATA MODULE ONLY (#1277 AC 4, scripts/check-seed-data-modules.sh): no
// direct database calls or async write logic may live in this file. expand()
// below is pure content assembly, not seeding logic.
//
// EDITION RULE (mirrors warlock-features.ts/wizard-features.ts): `edition`
// omitted -> expand() seeds ONE row per edition with IDENTICAL text — every
// row below is still untagged as of this commit (no 2024 content authored
// yet), so expand() produces byte-identical 2014/2024 pairs — commit 2 tags
// every row and adds real 2024 text.
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { SeedEdition } from "./edition.js";
import type { ClassFeatureSeedRow } from "./class-features.js";

// Guards a stray subclass-slug typo below at import time, same intent as
// classFeatureSeedSchema's z.enum(SUBCLASS_SLUGS) — cheaper than a zod parse
// for a fixed, tiny, module-local list (mirrors warlock-features.ts's/
// wizard-features.ts's own slug()).
function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`sorcerer-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawSorcererFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  /** Omitted -> identical text seeded for both editions (see file header). */
  edition?: SeedEdition;
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: string;
  resourceTotals?: { minLevel: number; total: number; shortRestRegain?: number }[];
}

function expand(raw: RawSorcererFeature): ClassFeatureSeedRow[] {
  const base: Omit<ClassFeatureSeedRow, "edition"> = {
    className: "Sorcerer",
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

// ---- Base class — PHB'14 p.99ff ---------------------------------------------
const SORCERER_BASE_RAW: RawSorcererFeature[] = [
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    description:
      "You cast spells using Charisma. Full-caster progression. You know a limited number of sorcerer spells (not prepared — always available).",
  },
  {
    subclassSlug: null,
    name: "Sorcerous Origin",
    level: 1,
    description:
      "Your innate magic comes from a specific origin (subclass). Your origin grants you features at levels 1, 6, 14, and 18.",
  },
  {
    subclassSlug: null,
    name: "Font of Magic",
    level: 2,
    description:
      "You have a pool of Sorcery Points equal to your sorcerer level. Spend them to create spell slots or fuel Metamagic options. Creating slots costs 2 SP (1st), 3 SP (2nd), 5 SP (3rd), 6 SP (4th), or 7 SP (5th). You can also expend a spell slot to gain SP equal to its level. Regain all SP on a long rest.",
  },
  {
    subclassSlug: null,
    name: "Metamagic",
    level: 3,
    description:
      "Choose 2 Metamagic options (3 at L10, 4 at L17) to twist your spells: Careful (protect allies in AoE), Distant (double range), Empowered (reroll damage dice), Extended (double duration), Heightened (impose disadvantage on target's first save), Quickened (cast as bonus action), Subtle (no verbal/somatic), or Twinned (target two creatures).",
  },
  {
    subclassSlug: null,
    name: "Sorcerous Restoration",
    level: 20,
    description: "You regain 4 expended Sorcery Points whenever you finish a short rest.",
  },
];

// ---- Draconic Bloodline — PHB'14 p.102ff ------------------------------------
const DRACONIC_BLOODLINE_SLUG = slug("sorcerer-draconic-bloodline");
const DRACONIC_BLOODLINE_RAW: RawSorcererFeature[] = [
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Dragon Ancestor",
    level: 1,
    description:
      "Choose a dragon type (black, blue, brass, bronze, copper, gold, green, red, silver, or white). You gain the ability to speak, read, and write Draconic, and have advantage on Charisma checks when interacting with dragons of that type.",
  },
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Draconic Resilience",
    level: 1,
    description: "Your HP maximum increases by 1 per sorcerer level. While not wearing armor, your AC equals 13 + your Dexterity modifier.",
  },
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Elemental Affinity",
    level: 6,
    description:
      "When you cast a spell that deals the damage type associated with your dragon ancestor, add your Charisma modifier to one damage roll. Also spend 1 Sorcery Point to gain resistance to that damage type for 1 hour.",
  },
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Dragon Wings",
    level: 14,
    description:
      "Sprout draconic wings as a bonus action, gaining a flying speed equal to your current speed. The wings last until you dismiss them (no action required).",
  },
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Draconic Presence",
    level: 18,
    description:
      "As an action, spend 5 Sorcery Points to channel draconic majesty for 1 minute (concentration). Each hostile creature within 60 ft that can see you must succeed on a Wisdom save (spell save DC) or be charmed (awed) or frightened (your choice) for the duration.",
  },
];

// ---- Wild Magic — PHB'14 p.103ff --------------------------------------------
const WILD_MAGIC_SLUG = slug("sorcerer-wild-magic");
const WILD_MAGIC_RAW: RawSorcererFeature[] = [
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Wild Magic Surge",
    level: 1,
    description:
      "After casting a sorcerer spell of 1st level or higher, the DM may ask you to roll a d20. On a 1, roll a d100 and consult the Wild Magic Surge table for a random magical effect.",
  },
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Tides of Chaos",
    level: 1,
    description:
      "Gain advantage on one attack roll, ability check, or saving throw. Once used, the DM can force a Wild Magic Surge before you can use this feature again. Alternatively, regain use after a long rest.",
  },
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Bend Luck",
    level: 6,
    description:
      "Spend 2 Sorcery Points as a reaction to add or subtract 1d4 from an attack roll, ability check, or saving throw made by a creature you can see.",
  },
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Controlled Chaos",
    level: 14,
    description: "When rolling on the Wild Magic Surge table, roll twice and use either result.",
  },
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Spell Bombardment",
    level: 18,
    description:
      "Once per turn when you roll damage for a spell and any die shows the highest possible result, choose one die, roll it again, and add the result to the damage.",
  },
];

export const SORCERER_FEATURES: ClassFeatureSeedRow[] = [...SORCERER_BASE_RAW, ...DRACONIC_BLOODLINE_RAW, ...WILD_MAGIC_RAW].flatMap(expand);
