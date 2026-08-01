// --- Wizard ClassFeature rows, authored as LITERAL data (#1234) ------------
// Commit 1 of 4 (mirrors Barbarian's #1223, itself modelled on Fighter's
// pilot, #1227/#1528/#1532) moves these rows off lib/classes/wizard.ts's
// AuthoredFeature[] arrays into literal seed data, byte-identical to the old
// TS-derived text (pinned by wizard-2014-snapshot.test.ts). Zero behaviour
// change: every row below is untagged, so expand() seeds identical text for
// both editions, exactly what the registry derived before this commit.
// Commit 2 will author Wizard's REAL SRD 5.2 (2024) content. Commit 3 will
// move Arcane Recovery's and Illusory Self's resource pools onto their rows
// and delete lib/classes/wizard.ts's resourceFns. Commit 4 will reduce
// lib/classes/wizard.ts to its irreducible residue — it is NOT deletable
// (unlike Fighter's/Barbarian's modules): its `grantLevel: 2` on every
// subclass is PHB'14's actual Arcane Tradition gate, and
// `subclassGateLevel`'s undefined-grantLevel fallback is 3 — see wizard.ts's
// own header and #1576 for the tracked follow-up.
// class-features.ts concatenates WIZARD_FEATURES onto the still-derived
// classes' rows to build CLASS_FEATURES; see its LITERAL_ROW_CLASSES export
// for the set of classes whose rows tests must not compare against a
// TS-array "old" side.
//
// DATA MODULE ONLY (#1277 AC 4, scripts/check-seed-data-modules.sh): no
// direct database calls or async write logic may live in this file. expand()
// below is pure content assembly, not seeding logic.
//
// EDITION RULE (mirrors fighter-features.ts/barbarian-features.ts): `edition`
// omitted -> expand() seeds ONE row per edition with IDENTICAL text —
// reserved for the handful of features that are genuinely edition-invariant
// in both mechanics AND wording. Commit 1 leaves every row below untagged
// (Wizard's 2024 content isn't authored yet). A "removed in 2024" feature
// means NOT authoring a 2024 row for that name, never deleting the 2014 row,
// and a level-shift is two rows with two `level` values, never one row
// edited in place — both apply starting commit 2. Every EDITION_2014 row is
// byte-identical to what this commit pins (wizard-2014-snapshot.test.ts) — no
// later commit ever edits a 2014 row's own name/level/description.
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { SeedEdition } from "./edition.js";
import type { ClassFeatureSeedRow } from "./class-features.js";

// Guards a stray subclass-slug typo below at import time, same intent as
// classFeatureSeedSchema's z.enum(SUBCLASS_SLUGS) — cheaper than a zod parse
// for a fixed, tiny, module-local list (mirrors fighter-features.ts's/
// barbarian-features.ts's own slug()).
function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`wizard-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawWizardFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  /** Omitted -> identical text seeded for both editions (see file header). */
  edition?: SeedEdition;
  // Resource-pool descriptor columns, declared now and populated in commit 3
  // (Arcane Recovery's and Illusory Self's rows only — see that commit's own
  // comment when it lands).
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: string;
  resourceTotals?: { minLevel: number; total: number; shortRestRegain?: number }[];
}

function expand(raw: RawWizardFeature): ClassFeatureSeedRow[] {
  const base: Omit<ClassFeatureSeedRow, "edition"> = {
    className: "Wizard",
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

// ---- Base class — byte-identical to wizard.ts's old WIZARD_FEATURES -------
const WIZARD_BASE_RAW: RawWizardFeature[] = [
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    description:
      "You cast spells using Intelligence. Full-caster progression. You copy spells into your spellbook and prepare a number equal to your Intelligence modifier + your wizard level (minimum 1) after each long rest.",
  },
  {
    subclassSlug: null,
    name: "Arcane Recovery",
    level: 1,
    description:
      "Once per day when finishing a short rest, choose expended spell slots to recover. Total levels of slots recovered can be up to half your wizard level (rounded up, max 5th-level slots).",
  },
  {
    subclassSlug: null,
    name: "Spell Mastery",
    level: 18,
    description:
      "Choose one 1st-level and one 2nd-level wizard spell in your spellbook. You can cast each of those spells at their lowest level without expending a spell slot. Changing choices requires 8 hours of study.",
  },
  {
    subclassSlug: null,
    name: "Signature Spells",
    level: 20,
    description:
      "Choose two 3rd-level wizard spells in your spellbook as signature spells. They are always prepared and don't count against your prepared spells count. You can cast each once without expending a slot; regain both uses after a short or long rest.",
  },
];

// ---- School of Evocation — byte-identical to wizard.ts's old ---------------
// ---- SCHOOL_OF_EVOCATION_FEATURES ------------------------------------------
const EVOCATION_SLUG = slug("wizard-school-of-evocation");
const EVOCATION_RAW: RawWizardFeature[] = [
  {
    subclassSlug: EVOCATION_SLUG,
    name: "Evocation Savant",
    level: 2,
    description: "The gold and time you must spend to copy an evocation spell into your spellbook is halved.",
  },
  {
    subclassSlug: EVOCATION_SLUG,
    name: "Sculpt Spells",
    level: 2,
    description:
      "When you cast an evocation spell, choose a number of creatures equal to 1 + the spell's level. Those creatures automatically succeed on their saving throw and take no damage (even if they'd normally take half on a success).",
  },
  {
    subclassSlug: EVOCATION_SLUG,
    name: "Potent Cantrip",
    level: 6,
    description: "When a creature succeeds on a saving throw against your cantrip, it takes half the cantrip's damage rather than none.",
  },
  {
    subclassSlug: EVOCATION_SLUG,
    name: "Empowered Evocation",
    level: 10,
    description: "Add your Intelligence modifier to one damage roll of any evocation spell you cast.",
  },
  {
    subclassSlug: EVOCATION_SLUG,
    name: "Overchannel",
    level: 14,
    description:
      "When you cast a wizard spell of 1st–5th level that deals damage, you can deal maximum damage with it. The first time per long rest you do so, you suffer no ill effect. Each use thereafter costs 2d12 necrotic per spell level (before the rest).",
  },
];

// ---- School of Abjuration — byte-identical to wizard.ts's old --------------
// ---- SCHOOL_OF_ABJURATION_FEATURES -----------------------------------------
const ABJURATION_SLUG = slug("wizard-school-of-abjuration");
const ABJURATION_RAW: RawWizardFeature[] = [
  {
    subclassSlug: ABJURATION_SLUG,
    name: "Abjuration Savant",
    level: 2,
    description: "The gold and time you must spend to copy an abjuration spell into your spellbook is halved.",
  },
  {
    subclassSlug: ABJURATION_SLUG,
    name: "Arcane Ward",
    level: 2,
    description:
      "When you cast an abjuration spell of 1st level or higher, a magical ward forms with HP equal to twice your wizard level + your Intelligence modifier. The ward absorbs damage before you do, and is recharged (2× the spell's level) each time you cast an abjuration spell.",
  },
  {
    subclassSlug: ABJURATION_SLUG,
    name: "Projected Ward",
    level: 6,
    description: "When a creature within 30 ft takes damage, use your reaction to have your Arcane Ward absorb that damage instead.",
  },
  {
    subclassSlug: ABJURATION_SLUG,
    name: "Improved Abjuration",
    level: 10,
    description: "When you cast an abjuration spell that requires an ability check, you add your proficiency bonus to that check.",
  },
  {
    subclassSlug: ABJURATION_SLUG,
    name: "Spell Resistance",
    level: 14,
    description: "You have advantage on saving throws against spells, and resistance to spell damage.",
  },
];

// ---- School of Illusion — byte-identical to wizard.ts's old ----------------
// ---- SCHOOL_OF_ILLUSION_FEATURES -------------------------------------------
const ILLUSION_SLUG = slug("wizard-school-of-illusion");
const ILLUSION_RAW: RawWizardFeature[] = [
  {
    subclassSlug: ILLUSION_SLUG,
    name: "Illusion Savant",
    level: 2,
    description: "The gold and time you must spend to copy an illusion spell into your spellbook is halved.",
  },
  {
    subclassSlug: ILLUSION_SLUG,
    name: "Improved Minor Illusion",
    level: 2,
    description:
      "You know the Minor Illusion cantrip (or a different wizard cantrip if you already know it). When you cast it, you can create both a sound and an image with a single casting.",
  },
  {
    subclassSlug: ILLUSION_SLUG,
    name: "Malleable Illusions",
    level: 6,
    description:
      "When you cast an illusion spell with a duration of 1 minute or longer, you can use your action to change the nature of that illusion (within its original parameters) while you can see it.",
  },
  {
    subclassSlug: ILLUSION_SLUG,
    name: "Illusory Self",
    level: 10,
    description:
      "When a creature makes an attack roll against you, use your reaction to interpose an illusory duplicate — the attack automatically misses. Once used, you regain this ability on a short or long rest.",
  },
  {
    subclassSlug: ILLUSION_SLUG,
    name: "Illusory Reality",
    level: 14,
    description:
      "When you cast an illusion spell of 1st level or higher, you can make one inanimate, nonmagical object part of the illusion real for 1 minute. The object can't deal damage or cause harm.",
  },
];

export const WIZARD_FEATURES: ClassFeatureSeedRow[] = [...WIZARD_BASE_RAW, ...EVOCATION_RAW, ...ABJURATION_RAW, ...ILLUSION_RAW].flatMap(expand);
