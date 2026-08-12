// --- Warlock ClassFeature rows, authored as LITERAL data (#1233) ------------
// Commit 1 of 3 (mirrors Fighter's pilot, #1227/#1528/#1532, and Barbarian's
// #1223) moved these rows off lib/classes/warlock.ts's AuthoredFeature[]
// arrays into literal seed data, byte-identical to the old TS-derived text
// (pinned by warlock-2014-snapshot.test.ts). Commit 2 authored Warlock's REAL
// SRD 5.2 (2024) content for the base class and The Fiend, transcribed
// directly from the official SRD 5.2 CC-BY PDF (never a wiki — three
// secondary transcriptions of the invocation-count table disagree with each
// other and with the PDF) — and tagged The Archfey/The Great Old One
// EDITION_2014-only, since their PHB'24 reworks are non-SRD and unverifiable
// (prisma/seed/subclasses.ts tags both Subclass rows the same way, same
// commit — see #1559's hard-fail this is also forced by). Commit 3 (this one)
// moves every movable resource pool onto its row (see the RESOURCE POOL block
// below) and shrinks lib/classes/warlock.ts to its irreducible residue — see
// that file's own header for why it survives (it is NOT deletable, unlike
// fighter.ts/barbarian.ts).
// class-features.ts concatenates WARLOCK_FEATURES onto the still-derived
// classes' rows to build CLASS_FEATURES; see its LITERAL_ROW_CLASSES export
// for the set of classes whose rows tests must not compare against a
// TS-array "old" side.
//
// DATA MODULE ONLY (#1277 AC 4, scripts/check-seed-data-modules.sh): no
// direct database calls or async write logic may live in this file. expand()
// below is pure content assembly, not seeding logic.
//
// EDITION RULE (mirrors fighter-features.ts/barbarian-features.ts): `edition`
// omitted -> expand() seeds ONE row per edition with IDENTICAL text — reserved
// for a feature genuinely edition-invariant in both mechanics AND wording
// (none of Warlock's rows qualify: even where the mechanics agree, this
// commit's 2024 text is transcribed from a different document, CLAUDE.md's
// ACTIONS precedent, so every row below is now explicitly tagged).
// `edition` set -> exactly the one row named; a "no 2024 successor" feature
// (Pact Boon, and every Archfey/Great Old One row) means NOT authoring a 2024
// row for that name, never deleting the 2014 row. A rename ("Expanded Spell
// List" -> "Fiend Spells") is a DIFFERENT name at the same level, so the old
// 2024 row simply disappears from the seed (pruneStalePartitions retires the
// DB row) rather than being edited in place. Every EDITION_2014 row below
// stays byte-identical to what commit 1 pinned (warlock-2014-snapshot.test.ts) —
// this commit only ever ADDS an `edition: "EDITION_2024"` tag alongside new
// 2024 text (or retags a whole subclass EDITION_2014, Archfey/GOO); it never
// edits a 2014 row's own name/level/description.
//
// RESOURCE POOL (commit 3 of 3, mirrors Fighter's #1227 -> #1528 and
// Barbarian's #1223 two-step): every Warlock pool that is a flat, level-tiered
// total moves onto its row's resourceKey/resourceLabel/resourceRecharge/
// resourceTotals below, replacing the `if (level >= N)` gate in
// lib/classes/warlock.ts's resourceFns (that file's own commit-3 edit deletes
// the Archfey/GOO resourceFns outright and shrinks the Fiend's to a single
// pool). #1528's "no-second-string" rule (poolFromRow reads the row's own
// `description`, never a second hand-written pool string) means each moved
// pool's description is now that row's feature text above — see this file's
// own PR for the list of dropped "Regain use on a …" sentences that lived
// only in the retired resourceFn strings, never in the byte-identical-pinned
// 2014 row text, so dropping them is this commit's accepted, intended
// consequence, not a regression to fix. The Fiend's 2024 Dark One's Own Luck
// (Charisma modifier, minimum once) moved onto its row too, #1685: its total
// is now `{ abilityMod: "charisma", min: 1 }`, evaluated by
// evaluateResourceTotal (class-feature-rows.ts) — warlock.ts's own resourceFn
// residue that used to supply it is deleted outright. Its 2014 row's pool
// (flat 1) already moved onto the row normally, commit 3's original pass. Per
// the owner's decision (#1233), NO `contactPatron` pool is authored — out of
// the issue's named pool set, and Mystic Arcanum's uses are already tracked
// separately as `arcanumUsed` (not by this ClassFeature machinery at all) —
// "every long-rest feature gets a pool" is not this codebase's rule.
import type { ResourceTotalFormula } from "../../src/lib/classes/class-feature-rows.js";
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { SeedEdition } from "./edition.js";
import type { ClassFeatureSeedRow } from "./class-features.js";

// Guards a stray subclass-slug typo below at import time, same intent as
// classFeatureSeedSchema's z.enum(SUBCLASS_SLUGS) — cheaper than a zod parse
// for a fixed, tiny, module-local list (mirrors fighter-features.ts's/
// barbarian-features.ts's slug()).
function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`warlock-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawWarlockFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  /** Omitted -> identical text seeded for both editions (see file header). */
  edition?: SeedEdition;
  // Resource-pool descriptor columns (#1233 commit 3, widened #1685) — see
  // this file's own header for why only Magical Cunning's, Dark One's Own
  // Luck's, Hurl Through Hell's, Fey Presence's, Misty Escape's, Dark
  // Delirium's and Entropic Ward's rows ever set these.
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: string;
  resourceTotals?: { minLevel: number; total: ResourceTotalFormula; shortRestRegain?: number }[];
  // Beguiling Defenses' unconditional Charmed immunity (#1121) — see this
  // file's own header for why only its row below sets this.
  conditionImmunities?: string[];
}

function expand(raw: RawWarlockFeature): ClassFeatureSeedRow[] {
  const base: Omit<ClassFeatureSeedRow, "edition"> = {
    className: "Warlock",
    subclassSlug: raw.subclassSlug,
    name: raw.name,
    level: raw.level,
    description: raw.description,
    resourceKey: raw.resourceKey,
    resourceLabel: raw.resourceLabel,
    resourceRecharge: raw.resourceRecharge,
    resourceTotals: raw.resourceTotals,
    conditionImmunities: raw.conditionImmunities,
  };
  const editions: SeedEdition[] = raw.edition ? [raw.edition] : ["EDITION_2014", "EDITION_2024"];
  return editions.map((edition) => ({ ...base, edition }));
}

// ---- Base class — PHB'14 p.105ff (2014) / SRD 5.2 pp. 70-71 (2024) --------
// 2014: 5 rows (byte-identical to commit 1 / warlock-2014-snapshot.test.ts).
// 2024: 7 rows — Pact Boon has NO 2024 successor (Pact of the Blade/Chain/
// Tome become Invocation options instead, out of scope per the issue; the
// 2014 row stays, never deleted) and Magical Cunning/Contact Patron/Epic Boon
// join as wholly new 2024 features.
const WARLOCK_BASE_RAW: RawWarlockFeature[] = [
  {
    subclassSlug: null,
    name: "Pact Magic",
    level: 1,
    edition: "EDITION_2014",
    description:
      "You cast spells using Charisma. Unique short-rest progression: all spell slots are the same (high) level and you regain all slots on a short or long rest. Slots scale: 1st at L1; 2nd at L3; 3rd at L5; 4th at L7; 5th at L9.",
  },
  {
    subclassSlug: null,
    name: "Pact Magic",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2 pp. 70-71: same short/long-rest recharge and same-level-slot
    // shape as 2014 — transcribed from a different document (CLAUDE.md's
    // ACTIONS precedent), so it still forks. Slot COUNT table stays out of
    // scope (#1127).
    description:
      "You form a pact with a mysterious patron to cast spells, using Charisma. You know two Warlock cantrips (more at levels 4 and 10) and prepare a growing list of Warlock spells, each no higher a level than the Slot Level shown for your level. All your Pact Magic spell slots are the same (high) level, and you regain every expended slot when you finish a Short or Long Rest. An Arcane Focus serves as your Spellcasting Focus.",
  },
  {
    subclassSlug: null,
    name: "Eldritch Invocations",
    level: 2,
    edition: "EDITION_2014",
    description:
      "Learn 2 eldritch invocations — magical studies that grant you permanent abilities or modify your spells (e.g., Agonizing Blast, Armor of Shadows, Devil's Sight). More invocations at levels 5, 7, 9, 12, 15, 18 (max 8 known).",
  },
  {
    subclassSlug: null,
    name: "Eldritch Invocations",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2 p.70: level-shifts 2 -> 1 (a level-1 Warlock now gains this
    // alongside Pact Magic), and the known-invocation table is fully
    // rewritten — transcribed from the SRD 5.2 PDF's own Warlock Features
    // table, NOT any wiki (three secondary sources disagreed with each other
    // and with the PDF; the issue's own "caps at 12" bullet exists in no
    // edition). Caps at 10, not 8.
    description:
      "You gain one Eldritch Invocation of your choice — a permanent magical ability or lesson unlocked by forbidden knowledge, such as Pact of the Tome — meeting any stated prerequisite. You gain additional invocations as you gain levels: 1 at level 1, 3 at level 2, 5 at level 5, 6 at level 7, 7 at level 9, 8 at level 12, 9 at level 15, and 10 at level 18. Whenever you gain a Warlock level, you can replace one invocation you know with a different one you qualify for, unless it's a prerequisite for another invocation you have.",
  },
  {
    subclassSlug: null,
    name: "Magical Cunning",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2 p.71. NEW in 2024 — no 2014 counterpart.
    description:
      "You can perform a 1-minute esoteric rite to regain expended Pact Magic spell slots, up to half your maximum (round up). Once you use this feature, you can't do so again until you finish a Long Rest.",
    resourceKey: "magicalCunning",
    resourceLabel: "Magical Cunning",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 2, total: 1 }],
  },
  {
    subclassSlug: null,
    name: "Pact Boon",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Your patron grants a boon: Pact of the Chain (familiar with special forms), Pact of the Blade (summon a pact weapon), or Pact of the Tome (Book of Shadows with extra cantrips and rituals).",
  },
  // Pact Boon has NO EDITION_2024 row — Pact of the Blade/Chain/Tome become
  // Eldritch Invocation options from level 1 instead (out of scope: the
  // invocation catalog itself is a follow-up). "No 2024 successor" means not
  // authoring a 2024 row for this name, never deleting the 2014 row above.
  {
    subclassSlug: null,
    name: "Contact Patron",
    level: 9,
    edition: "EDITION_2024",
    // SRD 5.2 p.71. NEW in 2024 — no 2014 counterpart.
    description:
      "You always have the Contact Other Plane spell prepared, and you can cast it without expending a spell slot to contact your patron directly — you automatically succeed on the spell's saving throw. Once you cast it this way, you can't do so again until you finish a Long Rest.",
  },
  {
    subclassSlug: null,
    name: "Mystic Arcanum",
    level: 11,
    edition: "EDITION_2014",
    description:
      "Choose one 6th-level spell from the warlock list as a Mystic Arcanum. You can cast it once without expending a spell slot per long rest. Gain a 7th-level arcanum at L13, 8th at L15, 9th at L17.",
  },
  {
    subclassSlug: null,
    name: "Mystic Arcanum",
    level: 11,
    edition: "EDITION_2024",
    // SRD 5.2 p.71: same level tiers as 2014 (13/15/17 -> 7th/8th/9th), a
    // different document's phrasing — forks even where the mechanics agree.
    description:
      "Your patron grants you a magical secret called an arcanum. Choose one level 6 Warlock spell as this arcanum; you can cast it once without expending a spell slot, and must finish a Long Rest before doing so again. You gain another arcanum spell the same way at level 13 (a 7th-level spell), level 15 (8th-level), and level 17 (9th-level). You regain all uses of your Mystic Arcanum when you finish a Long Rest.",
  },
  {
    subclassSlug: null,
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    // SRD 5.2 p.71. NEW in 2024 — no 2014 counterpart (2014 keeps a plain ASI
    // at 19 instead, already covered by the edition-invariant ASI-level
    // table, not a ClassFeature row). Mirrors Fighter's (#1227) and
    // Barbarian's (#1223) own Epic Boon rows; the feat system itself is
    // deferred — text only (owner decision, #1233).
    description: "You gain an Epic Boon feat of your choice (Boon of Fate recommended). You can take this feat only once.",
  },
  {
    subclassSlug: null,
    name: "Eldritch Master",
    level: 20,
    edition: "EDITION_2014",
    description:
      "Spend 1 minute entreating your patron to regain all expended Pact Magic spell slots. Once used, you must finish a long rest before you can do so again.",
  },
  {
    subclassSlug: null,
    name: "Eldritch Master",
    level: 20,
    edition: "EDITION_2024",
    // SRD 5.2 p.71: rewritten around 2024's own Magical Cunning feature
    // (regains ALL slots via that rite) rather than 2014's standalone
    // 1-minute-entreaty mechanic.
    description: "When you use your Magical Cunning feature, you regain all your expended Pact Magic spell slots.",
  },
];

// ---- The Fiend — SRD 5.2 pp. 75-76 (2024) / PHB'14 (2014) -----------------
// 2014: 5 rows (byte-identical to commit 1). 2024: 5 rows — Expanded Spell
// List RENAMES to Fiend Spells (that 2024 row disappears from the seed;
// pruneStalePartitions retires the DB row) and every other 2024 row is a
// genuine SRD 5.2 rework, transcribed directly from the SRD 5.2 PDF.
const FIEND_SLUG = slug("warlock-the-fiend");
const FIEND_RAW: RawWarlockFeature[] = [
  // #1374: PHB'14 grants the Expanded Spell List at warlock level 1, keyed by
  // SPELL level (not character level) — genuinely different text from the
  // pre-#1233 2024 row, which labelled tiers by 2024 character level
  // (#1128). Superseded below by Fiend Spells (the 2024 name for this
  // feature from #1233 on) — this row is kept only as the 2014 half's own
  // text/history; the 2024 half of the old pair is gone (renamed, not merely
  // retextured).
  {
    name: "Expanded Spell List",
    subclassSlug: FIEND_SLUG,
    level: 1,
    edition: "EDITION_2014",
    // PHB'14, "The Fiend" — Expanded Spell List. Page number deliberately
    // omitted — could not be verified from a licensed source (see PR).
    description:
      "Add fiend spells to your warlock list — the tiers below are SPELL levels, not warlock levels: Burning Hands, Command (1st); Blindness/Deafness, Scorching Ray (2nd); Fireball, Stinking Cloud (3rd); Fire Shield, Wall of Fire (4th); Flame Strike, Hallow (5th).",
  },
  {
    name: "Fiend Spells",
    subclassSlug: FIEND_SLUG,
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2 p.75-76: renamed from "Expanded Spell List" (#1233) — always-
    // prepared, keyed by WARLOCK level this time (2014's Expanded Spell List
    // keys by SPELL level, see the sibling row's own comment), and its L9
    // pair is Geas/Insect Plague, NOT the 2014 row's Flame Strike/Hallow.
    // Transcribed directly from the SRD 5.2 PDF's own Fiend Spells table.
    description:
      "The magic of your patron ensures you always have certain spells prepared, which don't count against the number of spells you can prepare with Pact Magic: Burning Hands, Command, Scorching Ray, Suggestion (level 3); Fireball, Stinking Cloud (level 5); Fire Shield, Wall of Fire (level 7); Geas, Insect Plague (level 9).",
  },
  {
    name: "Dark One's Blessing",
    subclassSlug: FIEND_SLUG,
    level: 1,
    edition: "EDITION_2014",
    description:
      "When you reduce a hostile creature to 0 HP, gain temporary HP equal to your Charisma modifier + your warlock level (minimum 1).",
  },
  {
    name: "Dark One's Blessing",
    subclassSlug: FIEND_SLUG,
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2 p.76: level-shifts 1 -> 3 (fires alongside Fiend Spells and
    // Dark One's Blessing's subclass grant, both now L3) and widens to also
    // trigger when someone ELSE reduces an enemy within 10 feet of you to 0
    // Hit Points.
    description:
      "When you reduce an enemy to 0 Hit Points, you gain temporary hit points equal to your Charisma modifier + your warlock level (minimum 1). You also gain this benefit when someone else reduces an enemy within 10 feet of you to 0 Hit Points.",
  },
  {
    name: "Dark One's Own Luck",
    subclassSlug: FIEND_SLUG,
    level: 6,
    edition: "EDITION_2014",
    description: "Add a d10 to one ability check or saving throw you make. Once used, regain on a short or long rest.",
    resourceKey: "darkOnesOwnLuck",
    resourceLabel: "Dark One's Own Luck",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 6, total: 1 }],
  },
  {
    name: "Dark One's Own Luck",
    subclassSlug: FIEND_SLUG,
    level: 6,
    edition: "EDITION_2024",
    // SRD 5.2 p.76: uses become the Charisma modifier (minimum of once) and
    // recharge narrows to a Long Rest only (2014 is short-or-long). #1685:
    // the total is now `{ abilityMod: "charisma", min: 1 }` — evaluated by
    // evaluateResourceTotal (class-feature-rows.ts), retiring
    // lib/classes/warlock.ts's EDITION_2024-gated resourceFn residue.
    description:
      "You can call on your fiendish patron to alter fate in your favor. When you make an ability check or a saving throw, add 1d10 to the roll after seeing it but before its effects occur. You can do this a number of times equal to your Charisma modifier (minimum of once), but no more than once per roll. Regain all expended uses when you finish a Long Rest.",
    resourceKey: "darkOnesOwnLuck",
    resourceLabel: "Dark One's Own Luck",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 6, total: { abilityMod: "charisma", min: 1 } }],
  },
  {
    name: "Fiendish Resilience",
    subclassSlug: FIEND_SLUG,
    level: 10,
    edition: "EDITION_2014",
    description:
      "After a short or long rest, choose one damage type. You gain resistance to that type until you choose a different one.",
  },
  {
    name: "Fiendish Resilience",
    subclassSlug: FIEND_SLUG,
    level: 10,
    edition: "EDITION_2024",
    // SRD 5.2 p.76: excludes Force damage from the choice — the only real
    // mechanical delta.
    description:
      "Choose one damage type, other than Force, whenever you finish a Short or Long Rest. You have resistance to that damage type until you choose a different one.",
  },
  {
    name: "Hurl Through Hell",
    subclassSlug: FIEND_SLUG,
    level: 14,
    edition: "EDITION_2014",
    description:
      "When you hit a creature with an attack, banish it through the Lower Planes until the start of your next turn. It takes 10d10 psychic damage from the horrors of its brief journey and then returns. Once used, regain on a long rest.",
    resourceKey: "hurlThroughHell",
    resourceLabel: "Hurl Through Hell",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 14, total: 1 }],
  },
  {
    name: "Hurl Through Hell",
    subclassSlug: FIEND_SLUG,
    level: 14,
    edition: "EDITION_2024",
    // SRD 5.2 p.76: once per TURN (not merely once per use of the feature);
    // the target gets a Charisma saving throw against your spell save DC
    // (2014 has no save at all); damage drops 10d10 -> 8d10 and only applies
    // if the target ISN'T a Fiend; the target gains the Incapacitated
    // condition until the end of your next turn instead of simply vanishing;
    // restorable early by expending a Pact Magic spell slot.
    description:
      "Once per turn when you hit a creature with an attack, you can try to instantly transport it through the Lower Planes. The target must succeed on a Charisma saving throw against your spell save DC or disappear and hurtle through a nightmare landscape, taking 8d10 psychic damage if it isn't a Fiend and gaining the Incapacitated condition until the end of your next turn, when it returns to its space or the nearest unoccupied one. Once used, you can't use it again until you finish a Long Rest unless you expend a Pact Magic spell slot (no action required) to restore it.",
    resourceKey: "hurlThroughHell",
    resourceLabel: "Hurl Through Hell",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 14, total: 1 }],
  },
];

// ---- The Archfey / The Great Old One — EDITION_2014 ONLY (#1233) ----------
// Both patrons' PHB'24 reworks are non-SRD (they appear in neither SRD 5.1
// nor SRD 5.2) and no licensed source could verify their text — transcribing
// from a wiki here is exactly the failure this issue exists to end (see the
// plan's "Source discipline" section). Owner decision (2026-08-01, issue
// #1233): tag EVERY row EDITION_2014 and author ZERO 2024 rows, following
// Path of the Totem Warrior's precedent (barbarian-features.ts, #1223,
// `3c781d10`). This is also forced: assertEverySubclassEditionPopulated
// (#1559) hard-fails the seed the instant a subclass is offered for an
// edition it has no rows in — prisma/seed/subclasses.ts tags both
// `warlock-the-archfey` and `warlock-the-great-old-one` Subclass rows
// EDITION_2014 in the SAME commit as these rows, for the same reason.
// Disclosed consequence: a 2024 Warlock can only pick The Fiend until PHB'24
// content is authored for these two, and their pools (feyPresence/
// mistyEscape/darkDelirium/entropicWard) stop deriving under 2024 — a
// CORRECTION, since before this they served PHB'14 text to a 2024 character.
const ARCHFEY_SLUG = slug("warlock-the-archfey");
const ARCHFEY_RAW: RawWarlockFeature[] = [
  {
    name: "Expanded Spell List",
    subclassSlug: ARCHFEY_SLUG,
    level: 1,
    edition: "EDITION_2014",
    // PHB'14, "The Archfey" — Expanded Spell List. Page number deliberately
    // omitted — could not be verified from a licensed source (see PR).
    description:
      "Add archfey spells to your warlock list — the tiers below are SPELL levels, not warlock levels: Faerie Fire, Sleep (1st); Calm Emotions, Phantasmal Force (2nd); Blink, Plant Growth (3rd); Dominate Beast, Greater Invisibility (4th); Dominate Person, Seeming (5th).",
  },
  {
    name: "Fey Presence",
    subclassSlug: ARCHFEY_SLUG,
    level: 1,
    edition: "EDITION_2014",
    description:
      "As an action, project a beguiling or dreadful aura in a 10-ft cube. Each creature there must succeed on a Wisdom save (spell save DC) or be charmed or frightened (your choice) until the end of your next turn. Once used, regain on a short or long rest.",
    resourceKey: "feyPresence",
    resourceLabel: "Fey Presence",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 1, total: 1 }],
  },
  {
    name: "Misty Escape",
    subclassSlug: ARCHFEY_SLUG,
    level: 6,
    edition: "EDITION_2014",
    description:
      "When you take damage, use your reaction to turn invisible and teleport up to 60 ft to an unoccupied space you can see. Invisibility lasts until the start of your next turn or until you attack or cast a spell. Once used, regain on a short or long rest.",
    resourceKey: "mistyEscape",
    resourceLabel: "Misty Escape",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 6, total: 1 }],
  },
  {
    name: "Beguiling Defenses",
    subclassSlug: ARCHFEY_SLUG,
    level: 10,
    edition: "EDITION_2014",
    description:
      "You are immune to being charmed. When another creature attempts to charm you, you can use your reaction to have it make a Wisdom saving throw (spell save DC) or be charmed by you for 1 minute or until it takes damage.",
    // #1121 — unconditional (no gating buff): PHB'14 p.109 flat Charmed
    // immunity, shared with PHB'24's Archfey (verified against PHB'24: "You
    // are immune to the Charmed condition") — Beguiling Defenses stays L10 in
    // both editions, so no level fork is needed here either. The reflect-
    // damage reaction half is enemy-targeted (self-or-announce), so it stays
    // reminder text in `description` only. Wires once Archfey seeds a 2024
    // row (Warlock #461) — no code change needed, only a second row.
    conditionImmunities: ["charmed"],
  },
  {
    name: "Dark Delirium",
    subclassSlug: ARCHFEY_SLUG,
    level: 14,
    edition: "EDITION_2014",
    description:
      "As an action, plunge a creature within 60 ft into an illusory dreamscape (Wisdom save DC = spell save DC). While charmed or frightened (your choice) it is incapacitated and ignores its surroundings. It repeats the save at the end of each turn, or when it takes damage. Once used, regain on a short or long rest.",
    resourceKey: "darkDelirium",
    resourceLabel: "Dark Delirium",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 14, total: 1 }],
  },
];

const GREAT_OLD_ONE_SLUG = slug("warlock-the-great-old-one");
const GREAT_OLD_ONE_RAW: RawWarlockFeature[] = [
  {
    name: "Expanded Spell List",
    subclassSlug: GREAT_OLD_ONE_SLUG,
    level: 1,
    edition: "EDITION_2014",
    // PHB'14, "The Great Old One" — Expanded Spell List. Page number
    // deliberately omitted — could not be verified from a licensed source
    // (see PR).
    description:
      "Add Great Old One spells to your warlock list — the tiers below are SPELL levels, not warlock levels: Dissonant Whispers, Hideous Laughter (1st); Detect Thoughts, Phantasmal Force (2nd); Clairvoyance, Sending (3rd); Dominate Beast, Black Tentacles (4th); Dominate Person, Telekinesis (5th).",
  },
  {
    name: "Awakened Mind",
    subclassSlug: GREAT_OLD_ONE_SLUG,
    level: 1,
    edition: "EDITION_2014",
    description:
      "Communicate telepathically with any creature you can see within 30 ft. The creature understands you even if it shares no language with you, though it cannot telepathically respond.",
  },
  {
    name: "Entropic Ward",
    subclassSlug: GREAT_OLD_ONE_SLUG,
    level: 6,
    edition: "EDITION_2014",
    description:
      "When a creature makes an attack roll against you, use your reaction to impose disadvantage. If it misses, you gain advantage on your next attack against it before the end of your next turn. Once used, regain on a short or long rest.",
    resourceKey: "entropicWard",
    resourceLabel: "Entropic Ward",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 6, total: 1 }],
  },
  {
    name: "Thought Shield",
    subclassSlug: GREAT_OLD_ONE_SLUG,
    level: 10,
    edition: "EDITION_2014",
    description:
      "Your thoughts can't be read by telepathy or other means unless you allow it. Resistance to psychic damage. When a creature deals psychic damage to you, it takes the same amount.",
  },
  {
    name: "Create Thrall",
    subclassSlug: GREAT_OLD_ONE_SLUG,
    level: 14,
    edition: "EDITION_2014",
    description:
      "Touch an incapacitated humanoid to charm it indefinitely (no save). While charmed, it obeys your commands and you share telepathic communication with it. Each time the thrall takes damage, it makes a Charisma save to break free (DC = your spell save DC).",
  },
];

export const WARLOCK_FEATURES: ClassFeatureSeedRow[] = [...WARLOCK_BASE_RAW, ...FIEND_RAW, ...ARCHFEY_RAW, ...GREAT_OLD_ONE_RAW].flatMap(expand);
