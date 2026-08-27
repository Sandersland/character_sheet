// Bard ClassFeature seed rows. 2014 text: PHB'14. 2024 text: the base class
// and College of Lore are transcribed from SRD 5.2.1 raw markdown
// (downfallx/dnd-5e-srd-markdown, classes.md). College of Valor is NOT in
// SRD 5.2 (owner decision, #1224): its 2024 text is mirror-sourced from three
// independent, non-scraper secondary sources (aidedd.org's Bard 2024
// reference, Roll20's licensed 2024 compendium, and D&D Beyond's first-party
// "2024 Bard vs. 2014 Bard" article) that agree word-for-mechanic — see the
// COLLEGE OF VALOR section below.
//
// DATA MODULE ONLY (#1277 AC 4, scripts/check-seed-data-modules.sh): no
// direct database calls or async write logic may live in this file. expand()
// below is pure content assembly, not seeding logic.
//
// Edition authoring rule (mirrors cleric-features.ts/ranger-features.ts):
// `edition` omitted -> expand() seeds one identical row per edition (none of
// Bard's rows qualify — CLAUDE.md's ACTIONS precedent: transcribed text
// forks even where mechanics agree). `edition` set -> exactly the one row
// named. A "no 2024 successor" feature (Song of Rest) means NOT authoring a
// 2024 row for that name, never deleting the 2014 row. A rename (Additional
// Magical Secrets -> Magical Discoveries, College of Valor's Bonus
// Proficiencies -> Martial Training) is a DIFFERENT name at the same or a
// shifted level, so the old 2024 row (where one existed) simply never gets
// authored, rather than being edited in place.
//
// Every Bard pool is row-declared (no resourceFn left); a reintroduced
// resourceFn pool would shadow a same-keyed row pool in mergePoolSources.
// Bardic Inspiration's total (SRD 5.1 p.53 / SRD 5.2 p.31: Charisma modifier,
// minimum of once), die ladder (d6/d8/d10/d12 at L1/5/10/15), and its
// longRest-below-L5/short-or-long-from-L5 (Font of Inspiration) recharge
// shift are edition-invariant and identical to the deleted bard.ts
// resourceFn's arithmetic — verified against both SRDs directly on each row.
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { ResourceTotalFormula } from "../../src/lib/classes/class-feature-rows.js";
import type { FeatImprovement } from "../../src/lib/classes/resources-state.js";
import type { RechargeOn } from "../../src/lib/classes/types.js";
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
  // A passive, always-on grant (#1691) — see ClassFeature.improvements' own
  // schema.prisma comment. Only College of Valor's 2014 "Bonus Proficiencies"
  // row sets this today.
  improvements?: FeatImprovement[];
  // Pool descriptor + activation columns: the action moved off DERIVED_ACTIONS
  // (#1909); the pool's totals/die/recharge tiers replaced the deleted
  // resourceFn (bard retab).
  resourceKey?: string;
  resourceLabel?: string;
  resourceTotals?: { minLevel: number; total: ResourceTotalFormula }[];
  resourceDieTiers?: { minLevel: number; die: string }[];
  resourceRechargeTiers?: { minLevel: number; recharge: RechargeOn }[];
  activationCost?: string;
  costKind?: string;
  costPoolKey?: string;
  costBase?: number;
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
    improvements: raw.improvements,
    resourceKey: raw.resourceKey,
    resourceLabel: raw.resourceLabel,
    resourceTotals: raw.resourceTotals,
    resourceDieTiers: raw.resourceDieTiers,
    resourceRechargeTiers: raw.resourceRechargeTiers,
    activationCost: raw.activationCost,
    costKind: raw.costKind,
    costPoolKey: raw.costPoolKey,
    costBase: raw.costBase,
  }));
}

// ---- Base class — PHB'14 p.53ff (2014) / SRD 5.2 pp. 30-33 (2024) ---------
// 2014: 9 rows (byte-identical to commit 1 / bard-2014-snapshot.test.ts).
// 2024: 10 rows — Song of Rest has NO 2024 successor (removed outright in
// PHB'24, not renamed); Epic Boon and Words of Creation join as wholly new
// 2024 features. Deliberately NOT authored: a "Bard Subclass" (L3) row — SRD
// 5.2's table lists it, but the 2014 side has no "Bard College" row to fork
// against, and the Cleric wave declined the equivalent (#1225).
const BARD_BASE_RAW: RawBardFeature[] = [
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2014",
    description:
      "You cast spells using Charisma. Full-caster progression (same slot table as Cleric/Wizard). You know a set number of spells from the bard list.",
  },
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2.1 classes.md:864-886: 2024 replaces the "know a set number of
    // spells" line with a genuine Prepared caster, cantrips-known table
    // (2 at L1, +1 at L4 and L10), and a Musical Instrument as the class's
    // Spellcasting Focus. #1127: the per-level Prepared Spells table itself
    // is NOT encoded — prose only.
    description:
      "You cast spells using Charisma. You know two Bard cantrips of your choice from the Bard spell list, replacing one whenever you gain a Bard level; you learn an additional cantrip at levels 4 and 10. You prepare a growing list of Bard spells (4 at level 1, rising to 22 by level 20, per the Bard Features table), regain all expended spell slots on a Long Rest, and can change your prepared list whenever you finish one. A Musical Instrument serves as your Spellcasting Focus.",
  },
  {
    subclassSlug: null,
    name: "Bardic Inspiration",
    level: 1,
    edition: "EDITION_2014",
    description:
      "As a bonus action, give one creature within 60 ft a Bardic Inspiration die (d6, becoming d8 at L5, d10 at L10, d12 at L15). They add it to one ability check, attack roll, or saving throw within 10 minutes.",
    // Row-driven action (#1909, moved off actions.ts's DERIVED_ACTIONS).
    resourceKey: "bardicInspiration",
    resourceLabel: "Bardic Inspiration",
    // SRD 5.1 p.53: a minimum of once, equal to your Charisma modifier.
    resourceTotals: [{ minLevel: 1, total: { abilityMod: "charisma", min: 1 } }],
    // SRD 5.1 p.54: d6 at L1, d8 at L5, d10 at L10, d12 at L15.
    resourceDieTiers: [
      { minLevel: 1, die: "d6" },
      { minLevel: 5, die: "d8" },
      { minLevel: 10, die: "d10" },
      { minLevel: 15, die: "d12" },
    ],
    // SRD 5.1 p.54: Long Rest below Font of Inspiration (L5), then short-or-long.
    resourceRechargeTiers: [
      { minLevel: 1, recharge: "longRest" },
      { minLevel: 5, recharge: "short-or-long" },
    ],
    activationCost: "bonusAction",
    costKind: "pool",
    costPoolKey: "bardicInspiration",
    costBase: 1,
  },
  {
    subclassSlug: null,
    name: "Bardic Inspiration",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2.1 classes.md:852-862: the target gate becomes "can see or hear
    // you" (2014: "can hear" only), the trigger becomes a failed D20 Test
    // (2014: any check/attack/save, chosen after the roll), and the window
    // widens from 10 minutes to the next hour.
    description:
      "As a Bonus Action, give one creature within 60 feet that can see or hear you a Bardic Inspiration die (d6, becoming d8 at level 5, d10 at level 10, d12 at level 15). Within the next hour, that creature can roll the die and add the number rolled to one D20 Test it makes, potentially turning the failure into a success.",
    resourceKey: "bardicInspiration",
    resourceLabel: "Bardic Inspiration",
    // SRD 5.2 p.31: a minimum of once, equal to your Charisma modifier — same
    // formula as 2014 (CLAUDE.md no-fork-when-they-agree rule).
    resourceTotals: [{ minLevel: 1, total: { abilityMod: "charisma", min: 1 } }],
    // SRD 5.2 p.31: d6 at level 1, d8 at level 5, d10 at level 10, d12 at level 15.
    resourceDieTiers: [
      { minLevel: 1, die: "d6" },
      { minLevel: 5, die: "d8" },
      { minLevel: 10, die: "d10" },
      { minLevel: 15, die: "d12" },
    ],
    // SRD 5.2 p.32: Long Rest below Font of Inspiration (L5), then short-or-long.
    resourceRechargeTiers: [
      { minLevel: 1, recharge: "longRest" },
      { minLevel: 5, recharge: "short-or-long" },
    ],
    activationCost: "bonusAction",
    costKind: "pool",
    costPoolKey: "bardicInspiration",
    costBase: 1,
  },
  {
    subclassSlug: null,
    name: "Jack of All Trades",
    level: 2,
    edition: "EDITION_2014",
    description:
      "Add half your proficiency bonus (rounded down) to any ability check that doesn't already use your proficiency bonus.",
  },
  {
    subclassSlug: null,
    name: "Jack of All Trades",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2.1 classes.md:894-898: narrows to a check "that uses a skill
    // proficiency you lack" (2014 grants it to any check not already using
    // your Proficiency Bonus, whether or not you're proficient) — a real
    // mechanical narrowing, not just a wording refresh.
    description:
      "Whenever you make an ability check that doesn't already use your Proficiency Bonus and that uses a skill proficiency you lack, you can add half your Proficiency Bonus (round down) to the check.",
  },
  {
    subclassSlug: null,
    name: "Song of Rest",
    level: 2,
    edition: "EDITION_2014",
    description:
      "If you or any friendly creatures spend hit dice during a short rest and you perform, they regain extra HP: 1d6 (L2), d8 (L9), d10 (L13), d12 (L17).",
  },
  // Song of Rest has NO EDITION_2024 row — removed outright in PHB'24, not
  // renamed or folded elsewhere (SRD 5.2.1 classes.md's Bard Features table
  // has no equivalent line).
  {
    subclassSlug: null,
    name: "Expertise",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Choose two of your skill proficiencies (or one skill + Thieves' Tools). Your proficiency bonus is doubled for those skills. Two more skills at level 10.",
    // #1588: PHB'14 p.53 — 2 skills at L3, 4 (2 more) at L10. Thieves' Tools
    // alternative not modelled (expertiseKnown is skills only) — same
    // disclosed-gap shape as Rogue's own 2014 row.
    derivedStat: "expertiseChoiceCount",
    derivedStatTiers: [
      { minLevel: 3, value: 2 },
      { minLevel: 10, value: 4 },
    ],
  },
  {
    subclassSlug: null,
    name: "Expertise",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2.1 classes.md's Bard Features table (L2/L9 rows) + :888-892:
    // level-shifts 3 -> 2 AND the second grant 10 -> 9.
    description:
      "Choose two of your skill proficiencies (or one skill proficiency and your Thieves' Tools proficiency). Your Proficiency Bonus is doubled for any ability check you make with either chosen proficiency. At level 9, choose two more skill proficiencies to gain this benefit.",
    // #1588: SRD 5.2.1 — 2 skills at L2, 4 (2 more) at L9 (this row's own
    // level-shifted grant, NOT the 2014 row's L3/L10 pair).
    derivedStat: "expertiseChoiceCount",
    derivedStatTiers: [
      { minLevel: 2, value: 2 },
      { minLevel: 9, value: 4 },
    ],
  },
  {
    subclassSlug: null,
    name: "Font of Inspiration",
    level: 5,
    edition: "EDITION_2014",
    description:
      "You regain all of your expended Bardic Inspiration uses on a short or long rest (previously only on a long rest).",
  },
  {
    subclassSlug: null,
    name: "Font of Inspiration",
    level: 5,
    edition: "EDITION_2024",
    // SRD 5.2.1 classes.md:908-912: adds the no-action spell-slot top-up —
    // #1528's no-second-string rule means this text must agree with the
    // Bardic Inspiration row's own pool description, which stays silent on
    // this clause rather than repeating it.
    description:
      "You regain all of your expended Bardic Inspiration uses when you finish a Short or Long Rest. In addition, you can expend a spell slot (no action required) to regain one expended use of Bardic Inspiration.",
  },
  {
    subclassSlug: null,
    name: "Countercharm",
    level: 6,
    edition: "EDITION_2014",
    description:
      "As an action, start a performance that lasts until the end of your next turn. During that time, friendly creatures within 30 ft have advantage on saves against being frightened or charmed.",
  },
  {
    subclassSlug: null,
    name: "Countercharm",
    level: 7,
    edition: "EDITION_2024",
    // SRD 5.2.1 classes.md:914-916: level-shifts 6 -> 7 and is a full
    // rewrite — no longer an action/performance/aura at all. Now a Reaction
    // that forces a failed Charmed/Frightened save to be rerolled with
    // Advantage, verbatim.
    description:
      "If you or a creature within 30 feet of you fails a saving throw against an effect that applies the Charmed or Frightened condition, you can take a Reaction to cause the save to be rerolled, and the new roll has Advantage.",
  },
  {
    subclassSlug: null,
    name: "Magical Secrets",
    level: 10,
    edition: "EDITION_2014",
    description:
      "Choose two spells from any class (including this one). They count as bard spells for you. Two more at level 14, two more at level 18.",
  },
  {
    subclassSlug: null,
    name: "Magical Secrets",
    level: 10,
    edition: "EDITION_2024",
    // SRD 5.2.1 classes.md:918-920: same level, but a standing broadening
    // from L10 up (keyed to the Prepared Spells number increasing, matching
    // magicalSecretsSpellLists/lib/srd/spellcasting-tables.ts, #1440), scoped
    // to Bard/Cleric/Druid/Wizard rather than "any class", and with NO L14/
    // L18 additional grants.
    description:
      "Whenever you reach a Bard level and the Prepared Spells number in the Bard Features table increases, you can choose any of your new prepared spells from the Bard, Cleric, Druid, and Wizard spell lists.",
  },
  {
    subclassSlug: null,
    name: "Superior Inspiration",
    level: 20,
    edition: "EDITION_2014",
    description:
      "When you roll initiative and have no uses of Bardic Inspiration remaining, you regain one use.",
  },
  {
    subclassSlug: null,
    name: "Superior Inspiration",
    level: 18,
    edition: "EDITION_2024",
    // SRD 5.2.1 classes.md:922-924: level-shifts 20 -> 18 and changes the
    // trigger from "zero uses" to "fewer than two uses", regaining until you
    // have two rather than regaining exactly one.
    description:
      "When you roll Initiative, you regain expended uses of Bardic Inspiration until you have two if you have fewer than that.",
  },
  {
    subclassSlug: null,
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    // SRD 5.2.1 classes.md table (L19) + :926-928, verbatim recommendation.
    // NEW in 2024 — no 2014 counterpart (2014 keeps a plain ASI at 19,
    // already covered by the edition-invariant ASI-level table). Text only —
    // the feat system itself is deferred (owner decision, mirrors every
    // prior class's own Epic Boon row).
    description: "You gain an Epic Boon feat of your choice (Boon of Spell Recall recommended). You can take this feat only once.",
  },
  {
    subclassSlug: null,
    name: "Words of Creation",
    level: 20,
    edition: "EDITION_2024",
    // SRD 5.2.1 classes.md:930-932. NEW in 2024 — no 2014 counterpart.
    description:
      "You always have the Power Word Heal and Power Word Kill spells prepared. When you cast either spell, you can target a second creature within 10 feet of the first target with the same spell.",
  },
];

// ---- College of Lore — PHB'14 p.55 (2014) / SRD 5.2 lines 1723-1746 (2024) --
// 2014: 4 rows (byte-identical to commit 1). 2024: 4 rows — Additional
// Magical Secrets renames to Magical Discoveries with a narrower list-scope
// (Cleric/Druid/Wizard, not any class); Bonus Proficiencies/Cutting Words/
// Peerless Skill all get an EDITION_2024 row too (tagged even where mechanics
// agree, CLAUDE.md's ACTIONS precedent: the text is transcribed from a
// different document).
const LORE_SLUG = slug("bard-college-of-lore");
const COLLEGE_OF_LORE_RAW: RawBardFeature[] = [
  {
    subclassSlug: LORE_SLUG,
    name: "Bonus Proficiencies",
    level: 3,
    edition: "EDITION_2014",
    description: "You gain proficiency in three skills of your choice.",
  },
  {
    subclassSlug: LORE_SLUG,
    name: "Bonus Proficiencies",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2.1 classes.md:1729-1731: mechanically identical; SRD says
    // proficiency "with" three skills rather than "in" three skills.
    description: "You gain proficiency with three skills of your choice.",
  },
  {
    subclassSlug: LORE_SLUG,
    name: "Cutting Words",
    level: 3,
    edition: "EDITION_2014",
    description:
      "When a creature within 60 ft that you can see makes an attack roll, ability check, or damage roll, use your reaction and expend one Bardic Inspiration die to subtract the number rolled from the creature's roll.",
  },
  {
    subclassSlug: LORE_SLUG,
    name: "Cutting Words",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2.1 classes.md:1733-1735: now a Reaction that retriggers on a
    // SUCCESSFUL damage roll/ability check/attack roll (2014: any of those
    // rolls, subtracting before success/failure is known), drops the "immune
    // if it can't hear you or is immune to being charmed" clause, and adds
    // that the effect works supernaturally.
    description:
      "When a creature you can see within 60 feet of yourself makes a damage roll or succeeds on an ability check or attack roll, you can take a Reaction and expend one Bardic Inspiration die, subtracting the number rolled from the creature's roll and potentially turning its success into a failure — this works supernaturally even against a creature that can't hear you.",
  },
  {
    subclassSlug: LORE_SLUG,
    name: "Additional Magical Secrets",
    level: 6,
    edition: "EDITION_2014",
    description:
      "Learn two spells from any class (including this one). They count as bard spells for you. This is in addition to the Magical Secrets you get at level 10.",
  },
  // Additional Magical Secrets has NO EDITION_2024 row — renamed outright to
  // Magical Discoveries below (a different name, a narrower list-scope, and a
  // cantrip-or-spell/always-prepared/replaceable shape the 2014 row never
  // had), never edited in place.
  {
    subclassSlug: LORE_SLUG,
    name: "Magical Discoveries",
    level: 6,
    edition: "EDITION_2024",
    // SRD 5.2.1 classes.md:1737-1741: two spells from Cleric, Druid, or
    // Wizard (or any combination), each a cantrip OR a spell you have slots
    // for, always prepared, replaceable whenever you gain a Bard level.
    description:
      "You always have two spells from the Cleric, Druid, or Wizard spell list prepared — a cantrip or a spell for which you have spell slots — chosen from any combination of the three. Whenever you gain a Bard level, you can replace one of these spells with another that meets this feature's criteria.",
  },
  {
    subclassSlug: LORE_SLUG,
    name: "Peerless Skill",
    level: 14,
    edition: "EDITION_2014",
    description:
      "When making an ability check, expend one Bardic Inspiration die to add the number rolled to the check. You can use this feature even if you're the one inspiring yourself.",
  },
  {
    subclassSlug: LORE_SLUG,
    name: "Peerless Skill",
    level: 14,
    edition: "EDITION_2024",
    // SRD 5.2.1 classes.md:1743-1745: widens to "ability check or attack
    // roll" (2014: ability check only), and the die is NOT expended if the
    // roll still fails, drops the "even if you're the one inspiring
    // yourself" clause (redundant given Bardic Inspiration's own 2024 text).
    description:
      "When you make an ability check or attack roll and fail, you can expend one Bardic Inspiration die and add the number rolled to the roll, potentially turning the failure into a success. On a failure, the Bardic Inspiration die isn't expended.",
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
    edition: "EDITION_2014",
    description: "You gain proficiency with medium armor, shields, and martial weapons.",
    // #1691: PHB'14 p.56 grants these outright, no choice involved.
    // 2014-row-only, matching this row's own edition — the 2024 successor
    // (Martial Training, below) is its own row and authors its own grant.
    improvements: [
      { target: "armorProficiency", amount: 1, key: "medium" },
      { target: "armorProficiency", amount: 1, key: "shield" },
      { target: "weaponProficiency", amount: 1, key: "Martial Weapons" },
    ],
  },
  // Bonus Proficiencies has NO EDITION_2024 row — renamed outright to Martial
  // Training below (a different name AND a scope change: it adds a
  // spellcasting-focus clause the 2014 row never had), never edited in place.
  {
    subclassSlug: VALOR_SLUG,
    name: "Martial Training",
    level: 3,
    // Mirror-sourced (aidedd.org's Bard 2024 reference, Roll20's licensed
    // 2024 compendium, and D&D Beyond's first-party "2024 Bard vs. 2014 Bard"
    // article — three independent, non-scraper sources agreeing word-for-
    // mechanic; see this file's own header). Adds Martial weapons to the 2014
    // grant (medium armor + shields), plus a wholly new clause: you can use a
    // Simple or Martial weapon as your Spellcasting Focus for Bard spells.
    edition: "EDITION_2024",
    description:
      "You gain proficiency with Martial weapons, Medium armor, and Shields. In addition, you can use a Simple or Martial weapon as a Spellcasting Focus for your Bard spells.",
  },
  {
    subclassSlug: VALOR_SLUG,
    name: "Combat Inspiration",
    level: 3,
    edition: "EDITION_2014",
    description:
      "A creature with a Bardic Inspiration die from you can also add it to a damage roll or use it as a reaction to add it to AC against one attack.",
  },
  {
    subclassSlug: VALOR_SLUG,
    name: "Combat Inspiration",
    level: 3,
    // Mirror-sourced: restructures the single "damage roll OR reaction to
    // AC" grant into two NAMED options — Defense (Reaction, add the die to
    // AC against the triggering attack) and Offense (add the die to damage
    // immediately after the creature hits, not to any damage roll it later
    // makes).
    edition: "EDITION_2024",
    description:
      "A creature that has a Bardic Inspiration die from you can use it in one of two ways, in addition to its other uses: Defense — when an attack roll targets that creature, it can take a Reaction to roll the Bardic Inspiration die and add the number rolled to its AC against that attack, potentially causing the attack to miss; or Offense — immediately after the creature hits with an attack roll, it can roll the Bardic Inspiration die and add the number rolled to the attack's damage roll.",
  },
  {
    subclassSlug: VALOR_SLUG,
    name: "Extra Attack",
    level: 6,
    edition: "EDITION_2014",
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
    name: "Extra Attack",
    level: 6,
    // Mirror-sourced: keeps the two-attacks grant and adds a new clause —
    // you may cast an action-cost cantrip in place of one of those attacks.
    // KEEP derivedStat/derivedStatTiers on BOTH edition rows (#1224 plan) —
    // dropping it from either silently kills Extra Attack for that edition's
    // Valor bard (class-feature-migration.test.ts's DERIVED_STAT_ROW_KEYS
    // already names this exact tuple, unchanged by this commit).
    edition: "EDITION_2024",
    description:
      "You can attack twice whenever you take the Attack action on your turn. Immediately after you attack this way, you can cast one of your cantrips that has a casting time of an action instead of making one of those attacks.",
    derivedStat: "attacksPerAction",
    derivedStatTiers: [{ minLevel: 6, value: 2 }],
  },
  {
    subclassSlug: VALOR_SLUG,
    name: "Battle Magic",
    level: 14,
    edition: "EDITION_2014",
    description: "When you use your action to cast a bard spell, make one weapon attack as a bonus action.",
  },
  {
    subclassSlug: VALOR_SLUG,
    name: "Battle Magic",
    level: 14,
    // Mirror-sourced: drops the restriction to BARD spells and to using your
    // action specifically — any spell with a casting time of an action
    // qualifies.
    edition: "EDITION_2024",
    description: "After you cast a spell that has a casting time of an action, you can make one weapon attack as a Bonus Action.",
  },
];

export const BARD_FEATURES: ClassFeatureSeedRow[] = [...BARD_BASE_RAW, ...COLLEGE_OF_LORE_RAW, ...COLLEGE_OF_VALOR_RAW].flatMap(expand);
