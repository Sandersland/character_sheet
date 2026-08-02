// --- Sorcerer ClassFeature rows, authored as LITERAL data (#1232) ----------
// Commit 1 of 3 (mirrors Barbarian's #1223, Warlock's #1233, Wizard's #1234)
// moved these rows off lib/classes/sorcerer.ts's AuthoredFeature[] arrays
// into literal seed data, byte-identical to the old TS-derived text (pinned
// by sorcerer-2014-snapshot.test.ts). Commit 2 authored Sorcerer's REAL SRD
// 5.2 (2024) content for the base class and both subclasses — SRD 5.2 itself
// only ships Draconic Sorcery (its own L3 text: "The Draconic Sorcery
// subclass is detailed after this class's description", singular), so Wild
// Magic Sorcery's 2024 text is mirror-sourced (two independently-agreeing
// mirrors, cited on its own rows below) rather than SRD-verified — see this
// file's WILD MAGIC section header for the provenance discipline. Commit 3
// (this one) moves every movable resource pool onto its row (see the
// RESOURCE POOL block below) and shrinks lib/classes/sorcerer.ts to its
// irreducible residue — see that file's own header for why it survives (it
// is NOT deletable, unlike fighter.ts/barbarian.ts).
// class-features.ts concatenates SORCERER_FEATURES onto the still-derived
// classes' rows to build CLASS_FEATURES; see its LITERAL_ROW_CLASSES export
// for the set of classes whose rows tests must not compare against a
// TS-array "old" side.
//
// SUBCLASS NAMES STAY "Draconic Bloodline"/"Wild Magic" (#1232, NOT renamed
// to PHB'24's "Draconic Sorcery"/"Wild Magic Sorcery"): seedSubclasses keys
// on (slug, edition), so a display-name RENAME is a pure content edit at
// that layer, but registry.ts's SUBCLASSES table is keyed by
// SUBCLASS_IDENTITY[slug].nameKey, and deriveResources looks up
// SUBCLASSES[(subclass ?? "").toLowerCase()] by the PERSISTED
// CharacterClassEntry.subclass display string — renaming the key would make
// every existing character carrying subclass: "Draconic Bloodline" fall
// through isSubclassActive's `if (!def) return false` and silently lose all
// subclass features and pools. #1234 faced the identical situation (School
// of Abjuration -> Abjurer etc.) and renamed nothing, recording the 2024
// names in section-header comments instead — same precedent followed here.
//
// DATA MODULE ONLY (#1277 AC 4, scripts/check-seed-data-modules.sh): no
// direct database calls or async write logic may live in this file. expand()
// below is pure content assembly, not seeding logic.
//
// EDITION RULE (mirrors warlock-features.ts/wizard-features.ts): `edition`
// omitted -> expand() seeds ONE row per edition with IDENTICAL text —
// reserved for a feature genuinely edition-invariant in both mechanics AND
// wording (none of Sorcerer's rows qualify: even where the mechanics agree,
// this commit's 2024 text is transcribed from a different document,
// CLAUDE.md's ACTIONS precedent, so every row below is explicitly tagged).
// `edition` set -> exactly the one row named; a "no 2024 successor" feature
// (Dragon Ancestor, Draconic Presence, Spell Bombardment) means NOT
// authoring a 2024 row for that name, never deleting the 2014 row. A rename
// ("Sorcerous Origin" -> "Sorcerer Subclass") is a DIFFERENT name at the same
// level, so the old 2024 row simply disappears from the seed
// (pruneStalePartitions retires the DB row) rather than being edited in
// place. Every EDITION_2014 row below stays byte-identical to what commit 1
// pinned (sorcerer-2014-snapshot.test.ts) — this commit only ever ADDS an
// `edition: "EDITION_2024"` tag alongside new 2024 text; it never edits a
// 2014 row's own name/level/description.
//
// RESOURCE POOL (commit 3 of 3, mirrors Warlock's/Wizard's own two-step):
// six rows carry a pool — Innate Sorcery (2024, flat 2 from L1), Sorcerous
// Restoration (2024, flat 1 from L5), Tides of Chaos (BOTH editions — flat 1
// from L1 in 2014, flat 1 from L3 in 2024, each row's own level replacing
// the old `if (level >= N)` gate), Dragon Wings (2024, flat 1 from L14), and
// Tamed Surge (2024, flat 1 from L18) — owner decision (#1232): pool every
// once-per-rest activated ability, matching Warlock's #1233 precedent, not
// just the two the issue itself named. `sorceryPoints` STAYS in
// lib/classes/sorcerer.ts's resourceFn (see that file's own header for why);
// this commit only edition-branches its DESCRIPTION, never its total, so
// Font of Magic's row text and the fn's pool description can agree on the
// Min. Sorcerer Level clause without a second hand-written string drifting
// from it (mirrors Warlock's Dark One's Own Luck residue). The wild-magic
// subclass resourceFn (tidesOfChaos) is DELETED in this same commit —
// mergePoolSources (registry.ts) has a resourceFn pool WIN over a row pool
// of the same key, so leaving the fn in place would make the new row column
// inert. #1528's "no-second-string" rule (poolFromRow reads the row's own
// `description`, never a second hand-written pool string) means the retired
// wild-magic resourceFn's own description text is simply gone from the
// wire — an accepted, intended consequence of the move, not a regression.
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
  // Resource-pool descriptor columns (#1232 commit 3) — see that commit's
  // own header for why only Innate Sorcery's, Sorcerous Restoration's, Tides
  // of Chaos' (both editions), Dragon Wings' and Tamed Surge's rows ever set
  // these.
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

// ---- Base class — PHB'14 p.99ff (2014) / SRD 5.2 pp. 139-141 (2024) -------
// 2014: 5 rows (byte-identical to commit 1). 2024: 9 rows — Innate Sorcery/
// Sorcery Incarnate/Epic Boon/Arcane Apotheosis are wholly new; Sorcerous
// Origin renames to Sorcerer Subclass (a different name at the same shifted
// level, so the old row disappears rather than being edited in place —
// pruneStalePartitions retires it).
const SORCERER_BASE_RAW: RawSorcererFeature[] = [
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2014",
    description:
      "You cast spells using Charisma. Full-caster progression. You know a limited number of sorcerer spells (not prepared — always available).",
  },
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2 p.139: switches from 2014's "known spells" model to a PREPARED
    // list (like Wizard/Cleric) — you choose which spells are prepared
    // whenever you finish a Long Rest, rather than knowing a fixed list
    // permanently. Cantrips known: 4 at level 1, 5 at level 4, 6 at level 10.
    // Slot-count table stays out of scope (#1127).
    description:
      "You cast spells using Charisma. Full-caster progression. You know 4 Sorcerer cantrips (5 at level 4, 6 at level 10) and prepare a growing list of Sorcerer spells — you choose which spells are prepared whenever you finish a Long Rest. An Arcane Focus serves as your Spellcasting Focus.",
  },
  {
    subclassSlug: null,
    name: "Innate Sorcery",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2 p.140. NEW in 2024 — no 2014 counterpart. #1232 commit 3 pools
    // this (resourceKey "innateSorcery", flat total 2 from level 1, longRest)
    // — the first pool a 2024 Sorcerer has, before level 2's Sorcery Points.
    description:
      "As a Bonus Action, unleash the wellspring of magic within you: for 1 minute, you gain a +1 bonus to your spell save DC and spell attack bonus, and you have Advantage on the attack rolls of Sorcerer spells you cast. You can use this feature twice, and you regain all expended uses when you finish a Long Rest.",
    resourceKey: "innateSorcery",
    resourceLabel: "Innate Sorcery",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 1, total: 2 }],
  },
  {
    subclassSlug: null,
    name: "Font of Magic",
    level: 2,
    edition: "EDITION_2014",
    description:
      "You have a pool of Sorcery Points equal to your sorcerer level. Spend them to create spell slots or fuel Metamagic options. Creating slots costs 2 SP (1st), 3 SP (2nd), 5 SP (3rd), 6 SP (4th), or 7 SP (5th). You can also expend a spell slot to gain SP equal to its level. Regain all SP on a long rest.",
  },
  {
    subclassSlug: null,
    name: "Font of Magic",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2 p.140: same Sorcery-Points-equal-level pool and the same five
    // slot-creation costs as 2014, but the Creating Spell Slots table adds a
    // MIN. SORCERER LEVEL column this row states in prose (out of scope for
    // mechanics — sorceryPointCostForSlot enforces cost/cap but not minimum
    // level, #1232 follow-up 2) — transcribed from a different document,
    // which forks even where the cost table agrees (CLAUDE.md's ACTIONS
    // precedent).
    description:
      "You have a pool of Sorcery Points equal to your Sorcerer level. As a Bonus Action, expend a spell slot to gain Sorcery Points equal to the slot's level, or spend Sorcery Points to create a spell slot (no action required): 2 SP for a level 1 slot (minimum Sorcerer level 2), 3 SP for level 2 (minimum level 3), 5 SP for level 3 (minimum level 5), 6 SP for level 4 (minimum level 7), 7 SP for level 5 (minimum level 9) — never above level 5. A slot created this way vanishes when you finish a Long Rest. You regain all expended Sorcery Points when you finish a Long Rest.",
  },
  {
    subclassSlug: null,
    name: "Metamagic",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Choose 2 Metamagic options (3 at L10, 4 at L17) to twist your spells: Careful (protect allies in AoE), Distant (double range), Empowered (reroll damage dice), Extended (double duration), Heightened (impose disadvantage on target's first save), Quickened (cast as bonus action), Subtle (no verbal/somatic), or Twinned (target two creatures).",
  },
  {
    subclassSlug: null,
    name: "Metamagic",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2 p.141: level-shifts 3 -> 2 (commit 2b forks the metamagic
    // Action's own grantLevel to match, lib/classes/actions.ts). Full 10-
    // option list — adds Seeking and Transmuted to 2014's eight, each with
    // its own Sorcery Point cost (Twinned scales with the spell's level, not
    // a flat cost, per the SRD 5.2 PDF's own table).
    description:
      "You gain 2 Metamagic options of your choice (2 more at level 10, 2 more at level 17), letting you twist your spells by spending Sorcery Points: Careful Spell (1 SP, protect chosen creatures from your own area spell), Distant Spell (1 SP, double range or make a touch spell reach 30 feet), Empowered Spell (1 SP, reroll damage dice up to your Charisma modifier), Extended Spell (1 SP, double a non-instantaneous duration), Heightened Spell (2 SP, Disadvantage on one target's first save against the spell), Quickened Spell (2 SP, cast an action spell as a Bonus Action), Seeking Spell (1 SP, reroll a missed spell attack roll), Subtle Spell (1 SP, cast without Verbal or Somatic components), Transmuted Spell (1 SP, change a spell's damage type to another type it can deal), or Twinned Spell (SP cost equal to the spell's level, minimum 1, target a second creature).",
  },
  {
    subclassSlug: null,
    name: "Sorcerous Origin",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Your innate magic comes from a specific origin (subclass). Your origin grants you features at levels 1, 6, 14, and 18.",
  },
  // Sorcerous Origin has NO EDITION_2024 row — renamed to Sorcerer Subclass
  // below (a DIFFERENT name at a shifted level, never a same-named pair) —
  // pruneStalePartitions retires the stale pre-#1232 2024 "Sorcerous Origin"
  // row (#1232 §2 correction 1: the issue's own "author at 3/6/14/18" bullet
  // named the SUBCLASS feature levels, not this base-class row's).
  {
    subclassSlug: null,
    name: "Sorcerer Subclass",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2 p.141: "Sorcerer Subclass", not "Sorcerous Origin" — confirmed
    // against a third source (#1232 §2 correction 1).
    description:
      "Your innate magic comes from a Sorcerer Subclass of your choice, which grants you features at levels 3, 6, 14, and 18.",
  },
  {
    subclassSlug: null,
    name: "Sorcerous Restoration",
    level: 20,
    edition: "EDITION_2014",
    description: "You regain 4 expended Sorcery Points whenever you finish a short rest.",
  },
  {
    subclassSlug: null,
    name: "Sorcerous Restoration",
    level: 5,
    edition: "EDITION_2024",
    // SRD 5.2 p.141: level-shifts 20 -> 5, and the regain amount changes from
    // a flat 4 to half your Sorcerer level (rounded down), once per Long
    // Rest rather than every short rest. #1232 commit 3 pools this
    // separately from `sorceryPoints` (resourceKey "sorcerousRestoration",
    // flat total 1, longRest) — the USE limit, not the SP total, is what a
    // pool tracks here (mirrors Warlock's Magical Cunning shape).
    description:
      "When you finish a Short Rest, you can regain expended Sorcery Points, up to a number equal to half your Sorcerer level (rounded down). Once you use this feature, you must finish a Long Rest before you can use it again.",
    resourceKey: "sorcerousRestoration",
    resourceLabel: "Sorcerous Restoration",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 5, total: 1 }],
  },
  {
    subclassSlug: null,
    name: "Sorcery Incarnate",
    level: 7,
    edition: "EDITION_2024",
    // SRD 5.2 p.141. NEW in 2024 — no 2014 counterpart.
    description:
      "You can spend 2 Sorcery Points to use your Innate Sorcery even if you have no uses of it left. While your Innate Sorcery is active, you can apply two Metamagic options to a spell you cast instead of one, paying their combined Sorcery Point cost.",
  },
  {
    subclassSlug: null,
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    // SRD 5.2 p.141. NEW in 2024 — no 2014 counterpart (2014 keeps a plain
    // ASI at 19 instead, already covered by the edition-invariant ASI-level
    // table, not a ClassFeature row). Mirrors Fighter's/Barbarian's/Warlock's/
    // Wizard's own Epic Boon rows; the feat system itself is deferred — text
    // only.
    description: "You gain an Epic Boon feat of your choice (Boon of Dimensional Travel recommended). You can take this feat only once.",
  },
  {
    subclassSlug: null,
    name: "Arcane Apotheosis",
    level: 20,
    edition: "EDITION_2024",
    // SRD 5.2 p.141: rewritten around 2024's own Innate Sorcery/Metamagic
    // features rather than 2014's flat Sorcery Point regain (which moved to
    // Sorcerous Restoration at level 5 above).
    description:
      "While your Innate Sorcery is active, you can apply one Metamagic option to a spell you cast without spending any Sorcery Points, once per turn.",
  },
];

// ---- Draconic Bloodline (2014) / Draconic Sorcery (2024, SRD 5.2 primary, --
// ---- PHB'24 p.148) ----------------------------------------------------------
// 2014: 5 rows (byte-identical to commit 1). 2024: 5 rows — Dragon Ancestor
// has no 2024 successor (folded into the L3 base-class-shaped Draconic Spells
// table below, #1232 §2 correction 8); Draconic Presence is REPLACED by
// Dragon Companion at L18 (a different mechanic, not a text revision).
// Subclass display name stays "Draconic Bloodline" — see file header (#1232
// §1.5; 2024 calls this subclass "Draconic Sorcery", recorded here only).
const DRACONIC_BLOODLINE_SLUG = slug("sorcerer-draconic-bloodline");
const DRACONIC_BLOODLINE_RAW: RawSorcererFeature[] = [
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Dragon Ancestor",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Choose a dragon type (black, blue, brass, bronze, copper, gold, green, red, silver, or white). You gain the ability to speak, read, and write Draconic, and have advantage on Charisma checks when interacting with dragons of that type.",
  },
  // Dragon Ancestor has NO EDITION_2024 row — folded into Draconic Spells'
  // dragon-type framing below, never authored as its own row in 2024.
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Draconic Resilience",
    level: 1,
    edition: "EDITION_2014",
    description: "Your HP maximum increases by 1 per sorcerer level. While not wearing armor, your AC equals 13 + your Dexterity modifier.",
  },
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Draconic Resilience",
    level: 3,
    edition: "EDITION_2024",
    // PHB'24 p.148 (SRD 5.2 primary): level-shifts 1 -> 3 (fires alongside
    // Sorcerer Subclass); HP bonus becomes a flat +3 plus 1/level rather than
    // a flat 1/level; unarmored AC changes to 10 + Dex + Cha (a genuine
    // mechanical change — out of scope for lib/srd/armor-class.ts, which has
    // no Sorcerer branch in EITHER edition today, #1232 §2 correction 5/
    // follow-up 1).
    description:
      "Your Hit Point maximum increases by 3, and it increases by 1 again whenever you gain a Sorcerer level. While you aren't wearing armor, your base Armor Class equals 10 plus your Dexterity and Charisma modifiers.",
  },
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Draconic Spells",
    level: 3,
    edition: "EDITION_2024",
    // PHB'24 p.148 (SRD 5.2 primary). NEW in 2024 — no 2014 counterpart;
    // folds Dragon Ancestor's dragon-type framing into an always-prepared
    // spell table (#1232 §2 correction 8) — mirrors Warlock's Fiend
    // Spells shape. Can't be SubclassGrantedSpell rows (that model has no
    // `edition` column, #1234's disclosed gap) — text only.
    description:
      "You always have certain spells prepared, keyed to the dragon type you choose for your Draconic Bloodline; they don't count against the number of spells you can prepare with Spellcasting: Alter Self, Chromatic Orb, Command, Dragon's Breath (level 3); Fear, Fly (level 5); Arcane Eye, Charm Monster (level 7); Legend Lore, Summon Dragon (level 9).",
  },
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Elemental Affinity",
    level: 6,
    edition: "EDITION_2014",
    description:
      "When you cast a spell that deals the damage type associated with your dragon ancestor, add your Charisma modifier to one damage roll. Also spend 1 Sorcery Point to gain resistance to that damage type for 1 hour.",
  },
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Elemental Affinity",
    level: 6,
    edition: "EDITION_2024",
    // PHB'24 p.148 (SRD 5.2 primary): the Sorcery-Point-spend resistance
    // becomes a PERMANENT resistance to your dragon type's damage — no SP
    // cost, no 1-hour duration.
    description:
      "You have Resistance to the damage type associated with your dragon ancestor. Whenever you cast a spell that deals damage of that type, you can add your Charisma modifier to one damage roll of that spell.",
  },
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Dragon Wings",
    level: 14,
    edition: "EDITION_2014",
    description:
      "Sprout draconic wings as a bonus action, gaining a flying speed equal to your current speed. The wings last until you dismiss them (no action required).",
  },
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Dragon Wings",
    level: 14,
    edition: "EDITION_2024",
    // PHB'24 p.148 (SRD 5.2 primary): the wings now last 1 hour (or until
    // dismissed) rather than indefinitely, grant a FLAT Fly Speed of 60 feet
    // rather than matching your current speed, and gain a once-per-Long-Rest
    // use limit restorable early for 3 Sorcery Points (#1232 §2 correction
    // 2 — a real fork AND a new pool, `dragonWings`, mirroring Warlock's 2024
    // Hurl Through Hell shape). #1232 commit 3 pools this (flat total 1,
    // longRest, from level 14).
    description:
      "As a Bonus Action, you sprout draconic wings, which last for 1 hour or until you dismiss them (no action required); while they persist, you have a Fly Speed of 60 feet. Once you use this feature, you can't use it again until you finish a Long Rest unless you spend 3 Sorcery Points (no action required) to restore your use of it.",
    resourceKey: "dragonWings",
    resourceLabel: "Dragon Wings",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 14, total: 1 }],
  },
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Draconic Presence",
    level: 18,
    edition: "EDITION_2014",
    description:
      "As an action, spend 5 Sorcery Points to channel draconic majesty for 1 minute (concentration). Each hostile creature within 60 ft that can see you must succeed on a Wisdom save (spell save DC) or be charmed (awed) or frightened (your choice) for the duration.",
  },
  // Draconic Presence has NO EDITION_2024 row — REPLACED by Dragon Companion
  // below (a wholly different mechanic at the same L18 slot, never a text
  // revision of this feature).
  {
    subclassSlug: DRACONIC_BLOODLINE_SLUG,
    name: "Dragon Companion",
    level: 18,
    edition: "EDITION_2024",
    // PHB'24 p.148 (SRD 5.2 primary). NEW in 2024 — no 2014 counterpart.
    // Always-prepared free-cast spell grant, same schema gap as Wizard's
    // Spell Breaker/Phantasmal Creatures (#1234): SubclassGrantedSpell has no
    // `edition` column and Subclass rows are edition-shared, so a grant row
    // would leak the spell to 2014 Draconic Bloodline sorcerers too — text
    // only here (#1232 follow-up 5).
    description:
      "You can cast Summon Dragon without expending a spell slot, a number of times equal to your Proficiency Bonus, regaining all expended uses when you finish a Long Rest. When you cast it this way, roll the die to randomly determine the dragon's type rather than choosing.",
  },
];

// ---- Wild Magic (2014) / Wild Magic Sorcery (2024, mirror-sourced) --------
// 2014: 5 rows (byte-identical to commit 1). 2024: 5 rows — Spell Bombardment
// has no 2024 successor; Tamed Surge is wholly new at L18.
//
// SRD 5.2 ships only Draconic Sorcery for this class (its own L3 text: "The
// Draconic Sorcery subclass is detailed after this class's description",
// singular) — Wild Magic Sorcery is NOT in SRD 5.2 at all. Owner decision
// (#1232, 2026-08-01): author all five 2024 rows anyway, mirror-sourced
// rather than SRD-verified. The two-independent-mirror bar is met by
// `5etools-mirror-3/5etools-src :: data/class/class-sorcerer.json` filtered
// to `source: "XPHB"` (the exact mirror wizard-features.ts's Abjurer/
// Illusionist blocks cite) and `dnd2024.wikidot.com/sorcerer:wild-magic-sorcery`
// (raw HTML), which agree character-for-character on all five features and
// levels. PROVENANCE TRAP checked and discharged: `ASNaeem/dnd2024-wikidot-
// scrapper :: data/sorcerer/wild-magic-sorcery.md` looks like a second mirror
// but its own front-matter reads `url: "http://dnd2024.wikidot.com/sorcerer:
// wild-magic-sorcery"` — it is a SCRAPE of the wikidot source, not an
// independent one, so it does not count toward the bar. Cite `PHB'24 p. 149
// (mirror-sourced; not in SRD 5.2)` (p. 150 for Tamed Surge) on every row
// below, naming both real mirrors in this header exactly as wizard-
// features.ts's Abjurer/Illusionist blocks do — there is no fallback branch.
// Subclass display name stays "Wild Magic" — see file header (#1232 §1.5;
// 2024 calls this subclass "Wild Magic Sorcery", recorded here only).
const WILD_MAGIC_SLUG = slug("sorcerer-wild-magic");
const WILD_MAGIC_RAW: RawSorcererFeature[] = [
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Wild Magic Surge",
    level: 1,
    edition: "EDITION_2014",
    description:
      "After casting a sorcerer spell of 1st level or higher, the DM may ask you to roll a d20. On a 1, roll a d100 and consult the Wild Magic Surge table for a random magical effect.",
  },
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Wild Magic Surge",
    level: 3,
    edition: "EDITION_2024",
    // PHB'24 p.149 (mirror-sourced; not in SRD 5.2) — 5etools-mirror-3 XPHB
    // extract + dnd2024.wikidot.com/sorcerer:wild-magic-sorcery agree
    // verbatim. Level-shifts 1 -> 3; the trigger becomes PLAYER-rolled (not
    // DM-prompted), once per turn, only after casting with a spell slot (not
    // any 1st-level-or-higher cast), and a surge triggered this way is now
    // immune to your own Metamagic (#1232 §2 correction 3 — the issue's own
    // bullet wrongly added an "or activating Innate Sorcery" clause that
    // appears in neither mirror, and dropped the once-per-turn/with-a-slot
    // qualifiers).
    description:
      "Once per turn, you can roll 1d20 immediately after you cast a Sorcerer spell with a spell slot. If you roll a 20, roll on the Wild Magic Surge table for a random magical effect. A spell that triggers a surge this way is immune to your Metamagic.",
  },
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Tides of Chaos",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Gain advantage on one attack roll, ability check, or saving throw. Once used, the DM can force a Wild Magic Surge before you can use this feature again. Alternatively, regain use after a long rest.",
    resourceKey: "tidesOfChaos",
    resourceLabel: "Tides of Chaos",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 1, total: 1 }],
  },
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Tides of Chaos",
    level: 3,
    edition: "EDITION_2024",
    // PHB'24 p.149 (mirror-sourced; not in SRD 5.2), same two mirrors as
    // above. Level-shifts 1 -> 3; the recharge is now EITHER a Long Rest OR
    // casting a Sorcerer spell with a slot, and casting to recharge
    // AUTOMATICALLY triggers a Wild Magic Surge roll rather than the DM
    // optionally forcing one (#1232 §2 correction 4 — the issue's own bullet
    // inverted the causality: the surge roll is a CONSEQUENCE of the
    // recharge, not its trigger). #1232 commit 3 pools this (flat total 1,
    // longRest, from level 3) — the 2014 row keeps its own pool at level 1.
    description:
      "Before you make a D20 Test, you can gain Advantage on it. Once you do so, you must finish a Long Rest or cast a Sorcerer spell using a spell slot before you can use this feature again — doing the latter automatically triggers a roll on the Wild Magic Surge table.",
    resourceKey: "tidesOfChaos",
    resourceLabel: "Tides of Chaos",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 3, total: 1 }],
  },
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Bend Luck",
    level: 6,
    edition: "EDITION_2014",
    description:
      "Spend 2 Sorcery Points as a reaction to add or subtract 1d4 from an attack roll, ability check, or saving throw made by a creature you can see.",
  },
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Bend Luck",
    level: 6,
    edition: "EDITION_2024",
    // PHB'24 p.149 (mirror-sourced; not in SRD 5.2), same two mirrors as
    // above. Sorcery Point cost drops from 2 to 1; otherwise unchanged.
    description:
      "When another creature you can see makes an attack roll, an ability check, or a saving throw, you can take a Reaction and spend 1 Sorcery Point to roll 1d4 and apply it as a bonus or penalty (your choice) to that creature's roll.",
  },
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Controlled Chaos",
    level: 14,
    edition: "EDITION_2014",
    description: "When rolling on the Wild Magic Surge table, roll twice and use either result.",
  },
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Controlled Chaos",
    level: 14,
    edition: "EDITION_2024",
    // PHB'24 p.149 (mirror-sourced; not in SRD 5.2), same two mirrors as
    // above. Mechanic unchanged; level unchanged.
    description: "Whenever you roll on the Wild Magic Surge table, you can roll twice and use either result.",
  },
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Spell Bombardment",
    level: 18,
    edition: "EDITION_2014",
    description:
      "Once per turn when you roll damage for a spell and any die shows the highest possible result, choose one die, roll it again, and add the result to the damage.",
  },
  // Spell Bombardment has NO EDITION_2024 row — REPLACED by Tamed Surge below
  // (a wholly different mechanic at the same L18 slot, never a text revision).
  {
    subclassSlug: WILD_MAGIC_SLUG,
    name: "Tamed Surge",
    level: 18,
    edition: "EDITION_2024",
    // PHB'24 p.150 (mirror-sourced; not in SRD 5.2), same two mirrors as
    // above. NEW in 2024 — no 2014 counterpart. #1232 commit 3 pools this
    // (flat total 1, longRest, from level 18).
    description:
      "Once per Long Rest, whenever you roll on the Wild Magic Surge table, you can replace the triggered effect with a Wild Magic Surge effect of your choice from the table, other than its final effect.",
    resourceKey: "tamedSurge",
    resourceLabel: "Tamed Surge",
    resourceRecharge: "longRest",
    resourceTotals: [{ minLevel: 18, total: 1 }],
  },
];

export const SORCERER_FEATURES: ClassFeatureSeedRow[] = [...SORCERER_BASE_RAW, ...DRACONIC_BLOODLINE_RAW, ...WILD_MAGIC_RAW].flatMap(expand);
