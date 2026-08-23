// --- Cleric ClassFeature rows, authored as LITERAL data (#1225) ------------
// Commit 1 of 3 (mirrors Barbarian's #1223 / Warlock's #1233 / Wizard's #1234)
// moved these rows off lib/classes/cleric.ts's AuthoredFeature[] arrays into
// literal seed data, byte-identical to the old TS-derived text (pinned by
// cleric-2014-snapshot.test.ts). Commit 2 authored Cleric's REAL SRD 5.2
// (2024) content: the base class and Life Domain are transcribed directly
// from the official SRD 5.2 CC-BY PDF (Cleric pp. 36-40) — never a wiki.
// Trickery Domain is NOT in SRD 5.2 (owner decision, #1225): its 2024 text is
// mirror-sourced from two independent, non-scraper secondary sources
// (aidedd.org's Cleric 2024 reference and dungeonmister.com's Trickery Domain
// guide) that agree on every mechanic below — see the TRICKERY DOMAIN section
// further down for the one number (Invoke Duplicity's move-range cap) neither
// source confirmed and that is therefore omitted rather than carried over
// from the 2014 text. Commit 3 (this one) moves the Channel Divinity resource
// pool onto its two carrier rows (see the RESOURCE POOL block below) and
// shrank lib/classes/cleric.ts to its irreducible residue — its `grantLevel: 1`
// on every subclass was PHB'14's actual Divine Domain gate, unlike
// fighter.ts/barbarian.ts's residue (both deleted outright by their own
// retabs) — until #1576's seeded CharacterClass.subclassLevel gave
// isSubclassActive a data source that survives the module's deletion, which
// is what let lib/classes/cleric.ts be deleted outright too.
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
// edition-invariant in both mechanics AND wording (none of Cleric's rows
// qualify, CLAUDE.md's ACTIONS precedent: even where a 2024 row's mechanics
// match 2014's, the text is transcribed from a different document, so every
// row below is explicitly tagged). `edition` set -> exactly the one row
// named. A "no 2024 successor" feature (Destroy Undead, Divine Intervention
// Improvement, Life/Trickery Domain's Bonus Proficiency/Divine Strike,
// Trickery's Cloak of Shadows) means NOT authoring a 2024 row for that name,
// never deleting the 2014 row. A rename ("Domain Spells" -> "Life Domain
// Spells" / "Trickery Domain Spells", "Destroy Undead" -> "Sear Undead",
// "Divine Intervention Improvement" -> "Greater Divine Intervention") is a
// DIFFERENT name at the same or a shifted level, so the old 2024 row (where
// one existed) simply disappears from the seed (pruneStalePartitions retires
// the DB row) rather than being edited in place — this is also how the two
// FABRICATED 2024 "Domain Spells" rows this commit removes actually leave the
// table (see the plan's correction 13: those rows were the PHB'14 lists with
// the first tier relabelled L1->L3, not real SRD 5.2/PHB'24 content). Every
// EDITION_2014 row below stays byte-identical to what commit 1 pinned
// (cleric-2014-snapshot.test.ts) — this commit only ever ADDS an
// `edition: "EDITION_2024"` tag alongside new 2024 text; it never edits a
// 2014 row's own name/level/description.
//
// RESOURCE POOL (commit 3 of 3, mirrors Barbarian's #1223/Warlock's #1233
// two-step): exactly ONE row per edition may set `resourceKey:
// "channelDivinity"` — two would both be pushed by poolsFromRows and silently
// "max"-merged by registry.ts's SHARED_POOL_MERGE instead of erroring.
// 2014's pool (totals 1/2/3 at L2/6/18, `recharge: "short-or-long"`, no
// shortRestRegain) rides the existing "Channel Divinity: Turn Undead" row —
// forced, not a choice: cleric-2014-snapshot.test.ts asserts no EXTRA 2014
// row exists, so a new 2014 "Channel Divinity" row is not allowed. 2024's
// pool (totals 2/3/4 at L2/6/18, `recharge: "longRest"`, `shortRestRegain: 1`
// on every tier) rides the new 2024 "Channel Divinity" row (SRD 5.2's actual
// feature name). `lib/classes/channel-divinity.ts` and
// `prisma/seed/channel-divinity.ts` do NOT re-declare this pool — they author
// GrantedAbility rows with `costPoolKey: "channelDivinity"` (spenders, not
// declarers), and `lib/classes/resources.ts` has no cleric branch — verified,
// no edits needed to any of them.
//
// DISCLOSED CONSEQUENCE (same as Barbarian's Rage, #1223): poolFromRow
// (class-feature-rows.ts) reads a row's own `description` as the pool's
// description — #1528's no-second-string rule — so the 2014 pool loses the
// interpolated `Turn Undead DC ${turnDC}` sentence that lib/classes/
// cleric.ts's retired resourceFn used to compute inline. NOT a regression:
// describeChannelDivinity (lib/classes/channel-divinity.ts) already computes
// and surfaces that DC per-option, and ChannelDivinitySection.tsx renders it
// as its own "Wisdom DC N" badge — the DC is still on the wire, just not
// duplicated into the pool's own description string.
//
// saveDcAbilities is STILL DELIBERATELY UNSET on every row below, even after
// #1589 fixed both original blockers this comment used to name (deriveRowExtras
// now runs over base-class rows unconditionally, and ClassExtras.maneuverSaveDC
// is renamed to the generic announcedSaveDC) — the reason has moved, not
// disappeared. (1) `announcedSaveDC` stays a SINGLE scalar overlaid across
// every class entry (deriveEntryScopedResources' overlayExtrasFields), so a
// Cleric/Battle-Master multiclass populating it here alongside Combat
// Superiority would still be a real collision — assignAnnouncedSaveDC
// (registry.ts) keeps the first (primary-class) DC and drops the second with
// a logged warning rather than the old silent clobber (it degrades instead of
// throwing because it runs on the GET read path, #1875), but it does not make
// the two values coexist. (2) There is no consumer benefit to accept that risk for: Cleric
// already serves its Turn Undead/Channel Divinity DC through a fully
// independent, already-correct path — channelDivinitySaveDC
// (lib/classes/channel-divinity.ts), rendered per-option by
// ChannelDivinitySection.tsx — which `saveDcAbilities`/`announcedSaveDC`
// would duplicate, not improve. The DC formula instead stays in this file's
// own prose (SRD 5.2's "the DC equals the spell save DC from this class's
// Spellcasting feature", i.e. 8 + Proficiency Bonus + Wisdom modifier) — see
// the 2024 Turn Undead row's own text above. If a future change gives
// `announcedSaveDC` per-feature wire scoping (so two classes' DCs can coexist
// on the wire the way sneakAttack/stunningStrike/maneuvers already do as
// separate riders), THAT is when this row should move onto saveDcAbilities —
// not before.
//
// TEXT-ONLY (mechanics not wired up, same disclosed shape as every prior
// retab wave — see EDITIONS_STILL_IDENTICAL's removal comment in
// seed-class-features.ts for the precedent): Divine Order's Protector/
// Thaumaturge choice, Blessed Strikes'/Improved Blessed Strikes' Divine
// Strike/Potent Spellcasting choice, Divine Spark's heal-or-damage Channel
// Divinity option, Epic Boon's feat grant, and Divine Intervention's cast-
// without-a-slot behavior. Both domains' always-prepared spell grants (Life/
// Trickery Domain Spells) ARE wired up, as per-edition SubclassGrantedSpell
// rows in subclass-granted-spells.ts (#1625's edition column; #1626 retagged
// the 2014/2024 divergences) — this file's domain-spell feature text is the
// authority those rows are cross-checked against, not their mechanism.
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { FeatImprovement } from "../../src/lib/classes/resources-state.js";
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
  edition: SeedEdition;
  // Resource-pool descriptor columns (#1225 commit 3) — see the RESOURCE POOL
  // header block above. Only Turn Undead's EDITION_2014 row and Channel
  // Divinity's EDITION_2024 row set these; every other row leaves them unset.
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: string;
  resourceTotals?: { minLevel: number; total: number; shortRestRegain?: number }[];
  // A passive, always-on grant (#1691) — see ClassFeature.improvements' own
  // schema.prisma comment. Only Life Domain's 2014 "Bonus Proficiency" row
  // sets this today.
  improvements?: FeatImprovement[];
  // Activation block (#1909) — Channel Divinity's row-driven action moved off
  // actions.ts's DERIVED_ACTIONS onto its two pool-carrier rows above (same
  // rows resourceKey/resourceTotals already ride, not a third row — see this
  // file's own RESOURCE POOL header block for why an extra 2014 row isn't
  // allowed).
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
    // SRD 5.2 p.36-37: the 2024 rules replace 2014's Wisdom-modifier formula
    // with a flat, level-only Prepared Spells table (4 at L1, rising to 22 at
    // L20) — verified directly against the table, not assumed to carry the
    // 2014 formula forward.
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
    // SRD 5.2 p.37. NEW NAME in 2024 — the pool itself (2014: "Channel
    // Divinity: Turn Undead" row) now has its own named feature separate from
    // its options. Uses 2/3/4 at L2/6/18 (Cleric Features table); recharge
    // verified verbatim: "You regain one of its expended uses when you finish
    // a Short Rest, and you regain all expended uses when you finish a Long
    // Rest."
    description:
      "You channel divine energy from the Outer Planes to fuel magical effects — Divine Spark and Turn Undead at 2nd level, more at higher levels. Each time you use it, choose which effect to create. You have 2 uses (3 at level 6, 4 at level 18). You regain one of its expended uses when you finish a Short Rest, and you regain all expended uses when you finish a Long Rest.",
    // The 2024 Channel Divinity pool carrier — see this file's own RESOURCE
    // POOL header block for why exactly one row per edition may set this key.
    resourceKey: "channelDivinity",
    resourceLabel: "Channel Divinity",
    resourceRecharge: "longRest",
    resourceTotals: [
      { minLevel: 2, total: 2, shortRestRegain: 1 },
      { minLevel: 6, total: 3, shortRestRegain: 1 },
      { minLevel: 18, total: 4, shortRestRegain: 1 },
    ],
    // Row-driven action (#1909, moved off actions.ts's DERIVED_ACTIONS) — the
    // SAME reminder text as paladin-features.ts's own two Channel Divinity
    // rows (PHB'14 p.164: one feature, one pool, shared across both granting
    // classes), so a Cleric/Paladin multiclass sees identical text regardless
    // of which entry's row wins the dedupe (#1340).
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
    // The 2014 Channel Divinity pool carrier — forced onto THIS row rather
    // than a new 2014 "Channel Divinity" row (see this file's own RESOURCE
    // POOL header block: cleric-2014-snapshot.test.ts asserts no extra 2014
    // row exists).
    resourceKey: "channelDivinity",
    resourceLabel: "Channel Divinity",
    resourceRecharge: "short-or-long",
    resourceTotals: [
      { minLevel: 2, total: 1 },
      { minLevel: 6, total: 2 },
      { minLevel: 18, total: 3 },
    ],
    // Row-driven action (#1909, moved off actions.ts's DERIVED_ACTIONS) — the
    // same forced placement as the pool above means the served card's own
    // `name` (buildRowAction reads row.name verbatim, #1528's no-second-
    // string rule) is "Channel Divinity: Turn Undead" for a SOLO 2014 Cleric,
    // not the generic "Channel Divinity" the retired DERIVED_ACTIONS row
    // hardcoded — a DELIBERATE, disclosed delta (this is the row's actual
    // PHB'14 p.60 feature name; 2024's carrier above is genuinely named
    // "Channel Divinity"). A Cleric/Paladin multiclass still gets exactly ONE
    // card and one merged pool, but which name shows follows primary-entry-wins
    // dedupe (deriveEntryScopedActions): a Cleric-primary multiclass surfaces
    // this row ("...: Turn Undead"), a Paladin-primary one surfaces Paladin's
    // "Channel Divinity" row. Either entry's reminder text is byte-identical
    // (see this row's own reminder below), so only the card label differs.
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
    // SRD 5.2 p.37: targeting changes to "each Undead of your choice" (not
    // merely those that can see/hear you), grants Frightened AND
    // Incapacitated (not a flee-only "turned" state), and adds a real early-
    // end clause the 2014 row never had — transcribed verbatim: "This effect
    // ends early on the creature if it takes any damage, if you have the
    // Incapacitated condition, or if you die."
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
  // Destroy Undead has NO EDITION_2024 row — replaced outright by Sear Undead
  // below (a different name and a wholly different mechanic: Radiant damage
  // rather than instant destruction by CR). "No 2024 successor" means not
  // authoring a 2024 row for this name, never deleting the 2014 row above.
  {
    subclassSlug: null,
    name: "Sear Undead",
    level: 5,
    edition: "EDITION_2024",
    // SRD 5.2 p.37, verbatim mechanic: roll a number of d8s equal to your
    // Wisdom modifier (not a cleric-level tier table, unlike Divine Spark) —
    // "This damage doesn't end the turn effect" is the load-bearing sentence
    // that keeps this row consistent with Turn Undead's own "ends early on
    // damage" clause above.
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
    // SRD 5.2 p.38: guaranteed (no percentile roll), restricted to a spell
    // "that doesn't require a Reaction to cast", and waives Material
    // components specifically — verbatim: "you cast that spell without
    // expending a spell slot or needing Material components."
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
  // Divine Intervention Improvement has NO EDITION_2024 row — replaced
  // outright by Greater Divine Intervention below (a different name; 2024's
  // Divine Intervention was already guaranteed at L10, so this feature's
  // JOB changes entirely, to a Wish upgrade).
  {
    subclassSlug: null,
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    // SRD 5.2 p.38, verbatim recommendation. NEW in 2024 — no 2014
    // counterpart (2014 keeps a plain ASI at 19 instead, already covered by
    // the edition-invariant ASI-level table, not a ClassFeature row). Text
    // only — the feat system itself is deferred (owner decision, mirrors
    // Fighter/Barbarian/Warlock/Wizard's own Epic Boon rows).
    description: "You gain an Epic Boon feat of your choice (Boon of Fate recommended). You can take this feat only once.",
  },
  {
    subclassSlug: null,
    name: "Greater Divine Intervention",
    level: 20,
    edition: "EDITION_2024",
    // SRD 5.2 p.38, verbatim on the rest count — the PDF's two-column
    // extraction can make "2d4 Long Rests" look fabricated; it isn't.
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
  // The pre-#1225 EDITION_2024 "Domain Spells" row (the PHB'14 list with its
  // first tier relabelled L1->L3) is FABRICATED — never SRD 5.2/PHB'24
  // content — and is retired here (renamed, not edited in place) in favor of
  // Life Domain Spells below, transcribed verbatim from SRD 5.2 p.40's own
  // Life Domain Spells table.
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
    // #1691: PHB'14 p.59 grants heavy armor proficiency outright, no choice
    // involved — was prose-only (a live bug: the row said it but nothing
    // granted it). 2014-row-only, matching this row's own edition: SRD 5.2
    // Life Domain does NOT grant it (see the comment below — it folds into
    // Divine Order's Protector option instead).
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
    // SRD 5.2 p.40: level-shifts 1 -> 3 (Cleric Subclass now grants at L3)
    // and keys the bonus off the SPELL SLOT's level, not the spell's own
    // level — a real, if subtle, wording change verified against the PDF.
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
    // SRD 5.2 p.40: level-shifts 2 -> 3, becomes a Magic action, and
    // restricts targets to Bloodied creatures (a real targeting change, not
    // merely a wording refresh) — verbatim on the restriction: "Choose
    // Bloodied creatures within 30 feet of yourself (which can include you)".
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
    // SRD 5.2 p.40: same level and same shape, keyed off the SPELL SLOT's
    // level (matching Disciple of Life's own wording shift above), and
    // requires the healing come from a spell cast WITH a spell slot.
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

// ---- Trickery Domain — PHB'14 p.63 (2014) / PHB'24 pp. 75-76 (2024, ------
// mirror-sourced) --------------------------------------------------------
// Trickery Domain is NOT in SRD 5.2 (owner decision, #1225): text below is
// authored only where aidedd.org's Cleric 2024 reference
// (https://www.aidedd.org/en/cleric-2024/) and dungeonmister.com's Trickery
// Domain guide (https://dungeonmister.com/guides/classes-in-dungeons-dragons/trickery-domain-cleric-dnd-2024/)
// — two independently-run, non-scraper sites (neither cites the other or a
// common wiki as its source; checked against the provenance trap the plan
// itself flags for dnd2024.wikidot.com/ASNaeem's scraper) — agree word-for-
// mechanic. One number neither source confirmed for 2024 specifically
// (Invoke Duplicity's illusion move-range CAP, "no more than 120 ft away
// from you" in the 2014 text) is deliberately OMITTED below rather than
// carried over from 2014 — see that row's own comment.
// 2014: 6 rows (byte-identical to commit 1). 2024: 5 rows — Divine Strike
// gets no 2024 successor (folds into the base class's Blessed Strikes, same
// as Life Domain's), and Channel Divinity: Cloak of Shadows gets no 2024
// successor either (replaced outright by the NEW Trickster's Transposition).
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
  // Same fabrication-retirement as Life Domain's own "Domain Spells" ->
  // renamed row above — the pre-#1225 EDITION_2024 row here was also the
  // PHB'14 list with its first tier relabelled, never real PHB'24 content.
  {
    subclassSlug: TRICKERY_DOMAIN_SLUG,
    name: "Trickery Domain Spells",
    level: 3,
    edition: "EDITION_2024",
    // Mirror-sourced (see file section header): both sources agree on every
    // spell and tier.
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
    // Mirror-sourced: level-shifts 1 -> 3, becomes a Magic action, extends
    // its range to 30 ft and no longer requires touch, and its duration
    // extends to "until you finish a Long Rest or you use this feature
    // again" (both sources agree, word for mechanic).
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
    // Mirror-sourced: level-shifts 2 -> 3, becomes a Bonus Action, and DROPS
    // Concentration entirely (both sources agree explicitly on this point) —
    // the plan's owner-flagged headline mechanical change. The move-range cap
    // ("no more than 120 ft away from you" in the 2014 text) is deliberately
    // OMITTED: neither source confirmed it still applies at this specific
    // number in 2024, and the plan's own rule is to author only the
    // uncontested part rather than carry a 2014 number forward unverified.
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
    // Mirror-sourced: the 2024 rework is NOT "up to four duplicates" (both
    // sources explicitly confirm this changed) — it gains two named benefits
    // on its ONE existing illusion instead: Shared Distraction (advantage for
    // you AND your allies, both sources agree) and Healing Illusion (Hit
    // Points equal to your Cleric level, not temporary HP — the plan's own
    // correction to the issue's draft).
    description:
      "Your Invoke Duplicity illusion gains two benefits: Shared Distraction — you and your allies have advantage on attack rolls against a creature within 5 ft of the illusion; Healing Illusion — when the illusion ends, you or a creature of your choice within 5 ft of it regains Hit Points equal to your Cleric level.",
  },
];

export const CLERIC_FEATURES: ClassFeatureSeedRow[] = [...CLERIC_BASE_RAW, ...LIFE_DOMAIN_RAW, ...TRICKERY_DOMAIN_RAW].flatMap(expand);
