// --- Bard ClassFeature rows, authored as LITERAL data (#1224) ---------------
// Commit 1 of 3 (mirrors Cleric's #1225 / Ranger's #1230 shape) moved these
// rows off lib/classes/bard.ts's AuthoredFeature[] arrays into literal seed
// data, byte-identical to the old TS-derived text (pinned by
// bard-2014-snapshot.test.ts). Commit 2 authored Bard's real SRD 5.2 (2024)
// content: the base class and College of Lore are transcribed directly from
// the SRD 5.2.1 raw markdown (downfallx/dnd-5e-srd-markdown, classes.md).
// College of Valor is NOT in SRD 5.2 (owner decision, #1224): its 2024 text is
// mirror-sourced from three independent, non-scraper secondary sources
// (aidedd.org's Bard 2024 reference, Roll20's licensed 2024 compendium, and
// D&D Beyond's first-party "2024 Bard vs. 2014 Bard" article) that agree word-
// for-mechanic — see the COLLEGE OF VALOR section below.
//
// Commit 3 is a no-op for resource-pool columns: unlike Cleric's Channel
// Divinity, Bardic Inspiration's pool does NOT move onto a row — see the
// RESOURCE POOL header block further down for the two independent blockers
// (a Cha-modifier formula AND a level-tiered recharge, neither of which
// `resourceTotals`/`resourceRecharge` can express as a single scalar). Bard is
// Ranger-shaped (lib/classes/ranger.ts), NOT Cleric-shaped: both Bard
// subclasses declare `grantLevel: 3`, which already equals
// subclassGateLevel's undefined fallback, so `lib/classes/bard.ts` survives
// this migration for its `resourceFn` ALONE, never for the gate level — see
// that file's own header.
//
// DATA MODULE ONLY (#1277 AC 4, scripts/check-seed-data-modules.sh): no
// direct database calls or async write logic may live in this file. expand()
// below is pure content assembly, not seeding logic.
//
// EDITION RULE (mirrors cleric-features.ts/ranger-features.ts): `edition`
// omitted -> expand() seeds ONE row per edition with IDENTICAL text — reserved
// for a feature genuinely edition-invariant in both mechanics AND wording
// (none of Bard's rows qualify, CLAUDE.md's ACTIONS precedent: even where a
// 2024 row's mechanics match 2014's, the text is transcribed from a different
// document, so every row below is explicitly tagged once commit 2 lands).
// `edition` set -> exactly the one row named. A "no 2024 successor" feature
// (Song of Rest) means NOT authoring a 2024 row for that name, never deleting
// the 2014 row. A rename (Additional Magical Secrets -> Magical Discoveries,
// College of Valor's Bonus Proficiencies -> Martial Training) is a DIFFERENT
// name at the same or a shifted level, so the old 2024 row (where one existed)
// simply never gets authored, rather than being edited in place. Every
// EDITION_2014 row below stays byte-identical to what commit 1 pinned
// (bard-2014-snapshot.test.ts) — commit 2 only ever ADDS an
// `edition: "EDITION_2024"` tag alongside new 2024 text; it never edits a 2014
// row's own name/level/description.
//
// RESOURCE POOL — Bardic Inspiration stays WHOLLY in lib/classes/bard.ts's
// resourceFn, with TWO independent blockers (not one):
// (1) Total is `Math.max(1, chaMod)` — a formula `resourceTotals` cannot
// express (schema.prisma's own ClassFeature.resourceKey comment names Bardic
// Inspiration as the canonical stay-in-TS case).
// (2) Recharge is level-tiered: `longRest` below level 5, `short-or-long` from
// level 5 (Font of Inspiration). `resourceRecharge` is a single scalar column
// with no `resourceRechargeTiers` sibling — a row physically cannot carry a
// recharge that changes mid-progression. This blocker is independent of (1)
// and would still block a row-based pool even if the total were fixed.
// No row below sets resourceKey/resourceLabel/resourceRecharge/resourceTotals
// — not even the resourceKey-without-resourceTotals documentation form
// Ranger/Warlock use for their own Wisdom/Charisma-modifier pools, since
// Ranger's/Warlock's pools have a SINGLE recharge value and Bard's doesn't; a
// half-declared row would misstate Bard's recharge for levels 1-4. The whole
// pool's shape is documented here in prose instead.
//
// The rule itself is edition-invariant, verified against BOTH SRDs: SRD 5.1
// ("Charisma modifier, a minimum of once"; die d6/d8/d10/d12 at L1/5/10/15;
// Long Rest recharge; Font of Inspiration upgrades to short-or-long) and SRD
// 5.2 (identical on every axis — "minimum of once", same die tiers, same
// recharge upgrade). bard.ts's resourceFn therefore takes NO `edition`
// parameter (CLAUDE.md's no-fork-when-they-agree rule) — its signature stays
// `(level, abilityScores)`.
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { SeedEdition } from "./edition.js";
import type { ClassFeatureSeedRow } from "./class-features.js";

// Guards a stray subclass-slug typo below at import time, same intent as
// classFeatureSeedSchema's z.enum(SUBCLASS_SLUGS) — cheaper than a zod parse
// for a fixed, tiny, module-local list (mirrors cleric-features.ts's/
// ranger-features.ts's slug()).
function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`bard-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawBardFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  edition?: SeedEdition;
  // #1530 descriptor pair — Bard needs these (College of Valor's Extra
  // Attack), unlike Cleric, whose rows set neither.
  derivedStat?: string;
  derivedStatTiers?: { minLevel: number; value: number | string }[];
}

function expand(raw: RawBardFeature): ClassFeatureSeedRow[] {
  const editions: SeedEdition[] = raw.edition ? [raw.edition] : ["EDITION_2014", "EDITION_2024"];
  return editions.map((edition) => ({
    className: "Bard",
    subclassSlug: raw.subclassSlug,
    name: raw.name,
    level: raw.level,
    description: raw.description,
    edition,
    derivedStat: raw.derivedStat,
    derivedStatTiers: raw.derivedStatTiers,
  }));
}

// ---- Base class — PHB'14 p.53ff (2014) / SRD 5.2 pp. 30-33 (2024) ---------
// 2014: 9 rows (byte-identical to commit 1 / bard-2014-snapshot.test.ts).
const BARD_BASE_RAW: RawBardFeature[] = [
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    description:
      "You cast spells using Charisma. Full-caster progression (same slot table as Cleric/Wizard). You know a set number of spells from the bard list.",
  },
  {
    subclassSlug: null,
    name: "Bardic Inspiration",
    level: 1,
    description:
      "As a bonus action, give one creature within 60 ft a Bardic Inspiration die (d6, becoming d8 at L5, d10 at L10, d12 at L15). They add it to one ability check, attack roll, or saving throw within 10 minutes.",
  },
  {
    subclassSlug: null,
    name: "Jack of All Trades",
    level: 2,
    description:
      "Add half your proficiency bonus (rounded down) to any ability check that doesn't already use your proficiency bonus.",
  },
  {
    subclassSlug: null,
    name: "Song of Rest",
    level: 2,
    description:
      "If you or any friendly creatures spend hit dice during a short rest and you perform, they regain extra HP: 1d6 (L2), d8 (L9), d10 (L13), d12 (L17).",
  },
  {
    subclassSlug: null,
    name: "Expertise",
    level: 3,
    description:
      "Choose two of your skill proficiencies (or one skill + Thieves' Tools). Your proficiency bonus is doubled for those skills. Two more skills at level 10.",
  },
  {
    subclassSlug: null,
    name: "Font of Inspiration",
    level: 5,
    description:
      "You regain all of your expended Bardic Inspiration uses on a short or long rest (previously only on a long rest).",
  },
  {
    subclassSlug: null,
    name: "Countercharm",
    level: 6,
    description:
      "As an action, start a performance that lasts until the end of your next turn. During that time, friendly creatures within 30 ft have advantage on saves against being frightened or charmed.",
  },
  {
    subclassSlug: null,
    name: "Magical Secrets",
    level: 10,
    description:
      "Choose two spells from any class (including this one). They count as bard spells for you. Two more at level 14, two more at level 18.",
  },
  {
    subclassSlug: null,
    name: "Superior Inspiration",
    level: 20,
    description:
      "When you roll initiative and have no uses of Bardic Inspiration remaining, you regain one use.",
  },
];

// ---- College of Lore — PHB'14 p.55 (2014) / SRD 5.2 lines 1723-1746 (2024) --
// 2014: 4 rows (byte-identical to commit 1).
const LORE_SLUG = slug("bard-college-of-lore");
const COLLEGE_OF_LORE_RAW: RawBardFeature[] = [
  {
    subclassSlug: LORE_SLUG,
    name: "Bonus Proficiencies",
    level: 3,
    description: "You gain proficiency in three skills of your choice.",
  },
  {
    subclassSlug: LORE_SLUG,
    name: "Cutting Words",
    level: 3,
    description:
      "When a creature within 60 ft that you can see makes an attack roll, ability check, or damage roll, use your reaction and expend one Bardic Inspiration die to subtract the number rolled from the creature's roll.",
  },
  {
    subclassSlug: LORE_SLUG,
    name: "Additional Magical Secrets",
    level: 6,
    description:
      "Learn two spells from any class (including this one). They count as bard spells for you. This is in addition to the Magical Secrets you get at level 10.",
  },
  {
    subclassSlug: LORE_SLUG,
    name: "Peerless Skill",
    level: 14,
    description:
      "When making an ability check, expend one Bardic Inspiration die to add the number rolled to the check. You can use this feature even if you're the one inspiring yourself.",
  },
];

// ---- College of Valor — PHB'14 p.56 (2014) / mirror-sourced (2024, NOT in --
// SRD 5.2) -------------------------------------------------------------------
// 2014: 4 rows (byte-identical to commit 1). 2024 text (commit 2) is
// authored only where aidedd.org's Bard 2024 reference
// (https://www.aidedd.org/en/bard-2024/), Roll20's licensed 2024 compendium
// (https://roll20.net/compendium/dnd5e/Subclasses:College%20of%20Valor), and
// D&D Beyond's first-party "2024 Bard vs. 2014 Bard" article — three
// independently-run, non-scraper sources (dnd2024.wikidot.com is deliberately
// NOT used, scraper provenance flagged in the Cleric wave) — agree word-for-
// mechanic.
const VALOR_SLUG = slug("bard-college-of-valor");
const COLLEGE_OF_VALOR_RAW: RawBardFeature[] = [
  {
    subclassSlug: VALOR_SLUG,
    name: "Bonus Proficiencies",
    level: 3,
    description: "You gain proficiency with medium armor, shields, and martial weapons.",
  },
  {
    subclassSlug: VALOR_SLUG,
    name: "Combat Inspiration",
    level: 3,
    description:
      "A creature with a Bardic Inspiration die from you can also add it to a damage roll or use it as a reaction to add it to AC against one attack.",
  },
  {
    subclassSlug: VALOR_SLUG,
    name: "Extra Attack",
    level: 6,
    // PHB-only content (not in SRD 5.1 or SRD 5.2 — both SRDs carry only
    // College of Lore for Bard, #1530 arbiter note) — no page # verified, so
    // no SRD/PHB citation is attached here; this row's tier is the value
    // deriveAttacksPerAction already returned for this subclass before this
    // row-driven rewrite (zero behaviour change), not new content.
    description: "You can attack twice whenever you take the Attack action.",
    derivedStat: "attacksPerAction",
    derivedStatTiers: [{ minLevel: 6, value: 2 }],
  },
  {
    subclassSlug: VALOR_SLUG,
    name: "Battle Magic",
    level: 14,
    description: "When you use your action to cast a bard spell, make one weapon attack as a bonus action.",
  },
];

export const BARD_FEATURES: ClassFeatureSeedRow[] = [...BARD_BASE_RAW, ...COLLEGE_OF_LORE_RAW, ...COLLEGE_OF_VALOR_RAW].flatMap(expand);
