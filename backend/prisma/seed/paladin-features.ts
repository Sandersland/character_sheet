// --- Paladin ClassFeature rows, authored as LITERAL data (#1229) -----------
// Commit 1 of 3 (mirrors Cleric's #1225 / Barbarian's #1223) moved these rows
// off lib/classes/paladin.ts's AuthoredFeature[] arrays into literal seed
// data, byte-identical to the old TS-derived text (pinned by
// paladin-2014-snapshot.test.ts). Commit 2 authored Paladin's REAL SRD 5.2
// (2024) content: the base class and Oath of Devotion are transcribed
// directly from the official SRD 5.2 CC-BY document (5e24srd.com/classes/
// paladin.html), cross-checked against aidedd.org/en/paladin-2024/ — the two
// agree on every mechanic, including the absence of a 2024 "Divine Health"
// feature (disease is no longer a mechanic in 2024; the poison-removal clause
// moves into Lay on Hands instead — see BASE_RAW's own comment). Oath of the
// Ancients and Oath of Vengeance are NOT in SRD 5.2 (owner decision, #1229):
// their 2024 text is mirror-sourced from two independent, non-scraper
// secondary sources (aidedd.org's Paladin 2024 reference and
// dungeonmister.com's own Oath guides) that agree on every mechanic below
// except two contested values, each disclosed and OMITTED rather than guessed
// on its own row (Vow of Enmity's action cost, Avenging Angel's duration —
// see those rows' own comments). Commit 3 (this one, done alongside) moves
// the Channel Divinity resource pool onto its base-class rows (see the
// RESOURCE POOL block below) — `lib/classes/paladin.ts` is NOT deleted,
// unlike fighter.ts/barbarian.ts/rogue.ts: it keeps divineSense/layOnHands in
// its resourceFn (formula-shaped pools, not tier tables) — see that file's
// own header for why this is a FOURTH end state.
// class-features.ts concatenates PALADIN_FEATURES onto the still-derived
// classes' rows to build CLASS_FEATURES; see its LITERAL_ROW_CLASSES export
// for the set of classes whose rows tests must not compare against a
// TS-array "old" side.
//
// DO NOT USE dnd2024.wikidot.com — the ASNaeem-scraper provenance trap #1225
// flagged.
//
// DATA MODULE ONLY (#1277 AC 4, scripts/check-seed-data-modules.sh): no
// direct database calls or async write logic may live in this file. expand()
// below is pure content assembly, not seeding logic.
//
// EDITION RULE (mirrors cleric-features.ts): every row below sets `edition`
// explicitly — `RawPaladinFeature.edition` is REQUIRED, not optional, so a
// feature that is genuinely edition-invariant (Extra Attack) is still
// authored as two rows with byte-identical `description` text rather than
// one untagged row (mirrors cleric-features.ts's own rule, CLAUDE.md's
// ACTIONS precedent: a content row's text is transcribed per document even
// where the mechanics agree). A "no 2024 successor" feature (Divine Sense,
// Divine Health, Divine Smite, Improved Divine Smite, Cleansing Touch, each
// oath's "Oath Spells" and the three retired Channel Divinity options) means
// NOT authoring a 2024 row for that name, never deleting the 2014 row. A
// rename ("Oath Spells" -> "Oath of <Oath> Spells", "Channel Divinity: Sacred
// Weapon" -> "Sacred Weapon", "Channel Divinity: Nature's Wrath" -> "Nature's
// Wrath", "Channel Divinity: Vow of Enmity" -> "Vow of Enmity", "Divine
// Smite" -> "Paladin's Smite", "Improved Divine Smite" -> "Radiant Strikes",
// "Cleansing Touch" -> "Restoring Touch", "Purity of Spirit" -> "Smite of
// Protection") is a DIFFERENT name at the same or a shifted level, so the old
// 2024 row simply never gets authored (pruneStalePartitions retires nothing
// here — these names never had a 2024 row to begin with, since #1523 seeded
// every class's EDITION_2024 half as an unverified COPY of its 2014 text,
// i.e. under the SAME 2014 names). Every EDITION_2014 row below stays
// byte-identical to what commit 1 pinned (paladin-2014-snapshot.test.ts) —
// commit 2 only ever ADDS an `edition: "EDITION_2024"` tag alongside new 2024
// text; it never edits a 2014 row's own name/level/description.
//
// FABRICATED BULLET WARNING (the issue's own text, corrected here): the issue
// asserts a 2024 "Divine Health" granting immunity to disease AND the
// Poisoned condition. There is no such feature in SRD 5.2 — 2024 deleted
// disease as a mechanic outright, and the Poisoned-condition removal is
// folded into Lay on Hands instead (see BASE_RAW's own comment). Authoring a
// 2024 "Divine Health" row would repeat wave B's exact failure mode
// (fabricated 2024 content that reads plausible and isn't).
//
// RESOURCE POOL (commit 3 of 3, mirrors cleric-features.ts's shape but with
// only ONE carrier row per edition, not two): exactly ONE row per edition may
// set `resourceKey: "channelDivinity"` — two would both be pushed by
// poolsFromRows and silently "max"-merged by registry.ts's SHARED_POOL_MERGE
// instead of erroring. Unlike Cleric — forced to hang its 2014 pool on the
// "Turn Undead" row, since Cleric's 2014 Channel Divinity has no feature of
// its own named "Channel Divinity" — Paladin already has a base-class row
// literally named "Channel Divinity" at L3 in BOTH editions
// (paladin.ts:48-54's pre-migration text), so each edition's pool rides its
// own same-named row: 2014's total 1 (short-or-long rest, no
// shortRestRegain); 2024's total 2/3 at L3/L11 (longRest, shortRestRegain 1
// on every tier, #1221) — SRD 5.2's own progression, verified verbatim: "You
// regain one of its expended uses when you finish a Short Rest, and you
// regain all expended uses when you finish a Long Rest."
// `lib/classes/channel-divinity.ts` and `prisma/seed/channel-divinity.ts` do
// NOT re-declare this pool — they author GrantedAbility rows with
// `costPoolKey: "channelDivinity"` (spenders, not declarers).
//
// saveDcAbilities is DELIBERATELY UNSET on every row below, for the same two
// blockers cleric-features.ts disclosed first: (1) deriveRowExtras
// (registry.ts) is only ever called with `subclassRows`, gated on
// `sub.active` — Channel Divinity/Abjure Foes are BASE-CLASS rows
// (subclassId: null), so a `saveDcAbilities` value here would be read by
// nothing, ever. (2) The one field it feeds, `ClassExtras.maneuverSaveDC`, is
// Fighter-named/Fighter-consumed — a Paladin value would clobber a
// Paladin/Battle-Master multiclass's real Str/Dex maneuver DC. The DC
// formula instead stays in prose ("the DC equals the spell save DC from this
// class's Spellcasting feature", i.e. 8 + Proficiency Bonus + Charisma
// modifier) — channelDivinitySaveDC (lib/classes/channel-divinity.ts)
// already serves the number per CD option. Follow-up filed: generalise
// deriveAnnouncedSaveDC to base-class rows and rename
// ClassExtras.maneuverSaveDC -> announcedSaveDC (already filed by #1225 as
// #1225's own follow-up; Paladin is the second class blocked by it, not a
// second issue).
//
// TEXT-ONLY (mechanics not wired up, same disclosed shape as every prior
// retab wave): Blessed Warrior's swappable-cantrip choice, Paladin's Smite's
// free cast, Faithful Steed's free cast, Epic Boon's feat grant, and every
// oath's always-prepared spell list. The last of these can't become
// SubclassGrantedSpell rows either: that model has no `edition` column and
// Subclass rows are edition-shared (the schema gap Wizard's #1234 disclosed
// first) — a 2024 Devotion Paladin is still GRANTED Sanctuary/Lesser
// Restoration even after this file's own feature text says Shield of
// Faith/Aid. Disclosed here, not fixed — follow-up filed, not expanded into.
import { SUBCLASS_SLUGS, type SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { SeedEdition } from "./edition.js";
import type { ClassFeatureSeedRow } from "./class-features.js";

// Guards a stray subclass-slug typo below at import time, same intent as
// classFeatureSeedSchema's z.enum(SUBCLASS_SLUGS) — cheaper than a zod parse
// for a fixed, tiny, module-local list (mirrors cleric-features.ts's/
// barbarian-features.ts's slug()).
function slug(s: SubclassSlug): SubclassSlug {
  if (!SUBCLASS_SLUGS.includes(s)) throw new Error(`paladin-features: unknown subclass slug "${s}"`);
  return s;
}

interface RawPaladinFeature {
  subclassSlug: SubclassSlug | null;
  name: string;
  level: number;
  description: string;
  edition: SeedEdition;
  // Extra Attack's descriptor columns (#1530 carryover) — the only row below
  // that ever sets these; both editions carry byte-identical text AND tiers,
  // so it's authored as two rows rather than one untagged row (see the file
  // header's EDITION RULE for why every row here still names its edition
  // explicitly regardless).
  derivedStat?: string;
  derivedStatTiers?: { minLevel: number; value: number | string }[];
  // Resource-pool descriptor columns (#1229 commit 3) — see the RESOURCE POOL
  // header block above. Only the two "Channel Divinity" rows (one per
  // edition) set these; every other row leaves them unset.
  resourceKey?: string;
  resourceLabel?: string;
  resourceRecharge?: string;
  resourceTotals?: { minLevel: number; total: number; shortRestRegain?: number }[];
}

function expand(raw: RawPaladinFeature): ClassFeatureSeedRow[] {
  return [
    {
      className: "Paladin",
      subclassSlug: raw.subclassSlug,
      name: raw.name,
      level: raw.level,
      description: raw.description,
      edition: raw.edition,
      derivedStat: raw.derivedStat,
      derivedStatTiers: raw.derivedStatTiers,
      resourceKey: raw.resourceKey,
      resourceLabel: raw.resourceLabel,
      resourceRecharge: raw.resourceRecharge,
      resourceTotals: raw.resourceTotals,
    },
  ];
}

// ---- Base class — PHB'14 p.82ff (2014) / SRD 5.2 pp. 46-49 (2024) ---------
// 2014: 12 rows (byte-identical to commit 1 / paladin-2014-snapshot.test.ts).
// 2024: 15 rows — Divine Sense and Divine Health have NO 2024 row at all
// (Divine Sense's job moves to the new "Channel Divinity: Divine Sense"
// subclass-agnostic option below; Divine Health is cut outright — disease
// stops being a mechanic in 2024). Divine Smite/Improved Divine Smite/
// Cleansing Touch each get a NEW-NAMED 2024 successor (Paladin's
// Smite/Radiant Strikes/Restoring Touch) so none of the three old names gets
// its own 2024 row. Faithful Steed/Abjure Foes/Aura Expansion/Epic Boon join
// as wholly new 2024 features.
const BASE_RAW: RawPaladinFeature[] = [
  {
    subclassSlug: null,
    name: "Divine Sense",
    level: 1,
    edition: "EDITION_2014",
    description:
      "As an action, sense the presence of celestials, fiends, and undead within 60 ft until the end of your next turn (they aren't hidden from this sense). You can also detect consecrated or desecrated places/objects. Uses = 1 + Charisma modifier per long rest.",
  },
  // Divine Sense has NO EDITION_2024 row — it stops being its own base-class
  // resource pool and becomes the base Channel Divinity option "Channel
  // Divinity: Divine Sense" below (a DIFFERENT name), gated at L3 rather than
  // L1.
  // Neither row below sets resourceKey (#1685 stretch goal, declined): its
  // total fits the `{ levelTimes: 5 }` shape, but each row's own description
  // states the formula IN WORDS ("5 × your paladin level" / "five times your
  // Paladin level") while lib/classes/paladin.ts's resourceFn description
  // states the COMPUTED NUMBER — moving onto the row would change what a
  // player actually reads, failing #1685's byte-identical AC; excluded
  // alongside Bardic Inspiration (bard-features.ts) rather than migrated —
  // see paladin.ts's own header for the full reasoning.
  {
    subclassSlug: null,
    name: "Lay on Hands",
    level: 1,
    edition: "EDITION_2014",
    description:
      "Touch to restore HP from a pool of 5 × your paladin level. Alternatively, spend 5 HP from the pool to cure one disease or neutralize one poison. The pool replenishes on a long rest.",
  },
  {
    subclassSlug: null,
    name: "Lay on Hands",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2: Bonus Action (was Action), and the disease-cure clause is cut
    // outright — 2024 keeps only a REWORDED poison clause, "remove the
    // Poisoned condition" rather than "neutralize one poison" (a fabricated
    // 2024 "Divine Health" would have repeated this exact clause under the
    // wrong feature name — see the file header's own warning).
    description:
      "As a Bonus Action, touch a creature and restore a number of Hit Points from a pool equal to five times your Paladin level. Alternatively, expend 5 Hit Points from the pool to remove the Poisoned condition from the creature instead of healing it. The pool refills when you finish a Long Rest.",
  },
  {
    subclassSlug: null,
    name: "Fighting Style",
    level: 2,
    edition: "EDITION_2014",
    description:
      "Choose a fighting style specialty: Defense (+1 AC in armor), Dueling (+2 melee damage with one weapon), Great Weapon Fighting (reroll 1s and 2s on damage), or Protection (impose disadvantage on attacks against adjacent allies).",
  },
  {
    subclassSlug: null,
    name: "Fighting Style",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2: the choice is now a Fighting Style FEAT, plus a new Paladin-
    // only option, Blessed Warrior, this class's feature table doesn't list
    // for anyone else — the issue's own draft omits this option entirely.
    description:
      "You gain a Fighting Style feat of your choice. Blessed Warrior is available only to you: learn two Cleric cantrips of your choice, treated as Paladin spells for you, using Charisma as your spellcasting ability for them; you can replace one of them whenever you gain a Paladin level.",
  },
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 2,
    edition: "EDITION_2014",
    description:
      "You cast spells using Charisma starting at level 2. Half-caster progression (you gain spell slots more slowly than full casters). You prepare a number of paladin spells equal to your Charisma modifier + half your paladin level (rounded down).",
  },
  {
    subclassSlug: null,
    name: "Spellcasting",
    level: 1,
    edition: "EDITION_2024",
    // SRD 5.2's Paladin Features table puts Spellcasting on the level-1 row
    // (verified verbatim) — the level-shift itself is in scope here and
    // consistent with #1507 (which forks spellcastingStartLevel so a 2014
    // Paladin's SLOTS still start at level 2; this row only changes when the
    // FEATURE TEXT appears, a different mechanism, same fact). Prepared-
    // spells table: 2 at level 1, rising to 15 by level 20 — byte-identical
    // to the Ranger 2024 column (#1507's own finding, confirmed here).
    description:
      "You cast spells using Charisma as your spellcasting ability. You are a Half-Caster: consult the Paladin Features table for your spell slots, which you gain starting at 1st level. You prepare a growing list of Paladin spells (2 at level 1, rising to 15 by level 20, per the Paladin Features table), regain all expended spell slots on a Long Rest, and can change your prepared list whenever you finish one. A Holy Symbol serves as your Spellcasting Focus.",
  },
  {
    subclassSlug: null,
    name: "Divine Smite",
    level: 2,
    edition: "EDITION_2014",
    description:
      "When you hit with a melee weapon attack, expend one spell slot to deal +2d8 radiant damage (+1d8 per slot level above 1st, max +5d8). Undead and fiends take an additional 1d8 radiant damage.",
  },
  // Divine Smite has NO EDITION_2024 row — replaced outright by Paladin's
  // Smite below (a different name: 2024 makes Divine Smite an always-
  // prepared SPELL rather than a bolt-on weapon-hit rider; Paladin's Smite is
  // the feature that grants free access to it).
  {
    subclassSlug: null,
    name: "Paladin's Smite",
    level: 2,
    edition: "EDITION_2024",
    // SRD 5.2, verbatim on the free-cast clause: "You always have the Divine
    // Smite spell prepared. In addition, you can cast it without expending a
    // spell slot, but you must finish a Long Rest before you can cast it in
    // this way again." Divine Smite itself is feature text only here — no
    // Spell catalog row exists for it (out of scope, follow-up filed).
    description:
      "You always have the Divine Smite spell prepared. In addition, you can cast it without expending a spell slot, but you must finish a Long Rest before you can cast it in this way again.",
  },
  {
    subclassSlug: null,
    name: "Divine Health",
    level: 3,
    edition: "EDITION_2014",
    description: "The divine magic flowing through you makes you immune to disease.",
  },
  // Divine Health has NO EDITION_2024 row — cut outright. 2024 deleted
  // disease as a mechanic; there is no 2024 successor of any name. THE
  // ISSUE'S OWN "Divine Health (L3): grant immunity to disease and the
  // Poisoned condition" BULLET IS FABRICATED (see the file header's own
  // warning) — both SRD 5.2 and aidedd.org's independent reference confirm
  // its absence.
  {
    subclassSlug: null,
    name: "Channel Divinity",
    level: 3,
    edition: "EDITION_2014",
    description:
      "You can channel divine energy through your sacred oath to fuel magical effects. You have 1 use, regained on a short or long rest. The specific options depend on your oath (see subclass features).",
    // The 2014 Channel Divinity pool carrier — see this file's own RESOURCE
    // POOL header block.
    resourceKey: "channelDivinity",
    resourceLabel: "Channel Divinity",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 3, total: 1 }],
  },
  {
    subclassSlug: null,
    name: "Channel Divinity",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2, verbatim on uses/recharge: "You have 2 uses (3 uses if you're
    // Paladin level 11 or higher)... You regain one of its expended uses when
    // you finish a Short Rest, and you regain all expended uses when you
    // finish a Long Rest." Base option = Divine Sense; the DC formula stays
    // in prose (see the file header's saveDcAbilities disclosure) —
    // "spell save DC" here means 8 + Proficiency Bonus + Charisma modifier,
    // exactly what channelDivinitySaveDC (lib/classes/channel-divinity.ts)
    // already computes per option.
    description:
      "You can channel divine energy to fuel magical effects. You start with one option, Divine Sense, and your Oath grants you more. When you use your Channel Divinity, choose one of its options; unless it says otherwise, no action is required. You can use your Channel Divinity twice between rests, and you gain a third use at Paladin level 11. You regain one of its expended uses when you finish a Short Rest, and you regain all expended uses when you finish a Long Rest. Any saving throw associated with a Channel Divinity option uses your spell save DC.",
    // The 2024 Channel Divinity pool carrier — see this file's own RESOURCE
    // POOL header block. #1221's partial short-rest top-up rides the tier
    // object.
    resourceKey: "channelDivinity",
    resourceLabel: "Channel Divinity",
    resourceRecharge: "longRest",
    resourceTotals: [
      { minLevel: 3, total: 2, shortRestRegain: 1 },
      { minLevel: 11, total: 3, shortRestRegain: 1 },
    ],
  },
  {
    subclassSlug: null,
    name: "Channel Divinity: Divine Sense",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2, verbatim on trigger/duration: a Bonus Action, 10 minutes (or
    // until Incapacitated), and the "creature type" / Hallow-spell clause for
    // consecrated/desecrated places.
    description:
      "As a Bonus Action, expend a use of your Channel Divinity to open your awareness to the presence of celestials, fiends, and undead within 60 feet of yourself that aren't behind total cover. For 10 minutes or until you have the Incapacitated condition, you know the location of any creature of those types in that radius and, for any creature you can see, whether it is one of those creature types. You also learn the creature type of any place or object in the area consecrated or desecrated as with the Hallow spell.",
  },
  {
    subclassSlug: null,
    name: "Extra Attack",
    level: 5,
    edition: "EDITION_2014",
    description: "You can attack twice whenever you take the Attack action on your turn.",
    // #1530: edition-invariant in both mechanics AND wording (SRD 5.1 / SRD
    // 5.2 Paladin, Extra Attack — one flat tier, no further scaling at higher
    // levels, unlike Fighter) — still authored as two rows per the file
    // header's EDITION RULE, not one untagged row.
    derivedStat: "attacksPerAction",
    derivedStatTiers: [{ minLevel: 5, value: 2 }],
  },
  {
    subclassSlug: null,
    name: "Extra Attack",
    level: 5,
    edition: "EDITION_2024",
    description: "You can attack twice whenever you take the Attack action on your turn.",
    derivedStat: "attacksPerAction",
    derivedStatTiers: [{ minLevel: 5, value: 2 }],
  },
  {
    subclassSlug: null,
    name: "Faithful Steed",
    level: 5,
    edition: "EDITION_2024",
    // SRD 5.2. NEW in 2024 — no 2014 counterpart.
    description:
      "You always have the Find Steed spell prepared, and you can cast it once without a spell slot, doing so again only after you finish a Long Rest.",
  },
  {
    subclassSlug: null,
    name: "Aura of Protection",
    level: 6,
    edition: "EDITION_2014",
    description:
      "Friendly creatures within 10 ft add your Charisma modifier (minimum +1) to saving throws while you are conscious. Aura extends to 30 ft at level 18.",
  },
  {
    subclassSlug: null,
    name: "Aura of Protection",
    level: 6,
    edition: "EDITION_2024",
    // SRD 5.2: now a 10-foot Emanation, inactive while Incapacitated, and the
    // "30 ft at level 18" sentence moves OUT into its own feature (Aura
    // Expansion, L18, below) — every 2024 aura drops this sentence.
    description:
      "You and friendly creatures within your 10-foot Emanation add your Charisma modifier (minimum +1) to saving throws, an effect that is inactive while you have the Incapacitated condition. If another Paladin is within the Emanation, a creature can benefit from only one Aura of Protection at a time; that creature chooses which aura applies.",
  },
  {
    subclassSlug: null,
    name: "Abjure Foes",
    level: 9,
    edition: "EDITION_2024",
    // SRD 5.2, verbatim on the save/effect: a Wisdom saving throw (NOT
    // Charisma — the issue's own draft says Cha; the DC itself IS
    // Charisma-derived, but the save ability the target rolls is Wisdom),
    // Frightened for 1 minute or until damaged, and the one-of-three action
    // restriction while Frightened. NEW in 2024 — no 2014 counterpart.
    description:
      "As a Magic action, expend a use of your Channel Divinity to overwhelm creatures with divine awe. Choose a number of creatures you can see within 60 feet of yourself, up to your Charisma modifier (minimum of one creature). Each target must succeed on a Wisdom saving throw or have the Frightened condition for 1 minute or until it takes any damage. While Frightened, a target can do only one of the following on its turn: move, take an action, or take a bonus action.",
  },
  {
    subclassSlug: null,
    name: "Aura of Courage",
    level: 10,
    edition: "EDITION_2014",
    description:
      "Friendly creatures within 10 ft can't be frightened while you are conscious. Aura extends to 30 ft at level 18.",
  },
  {
    subclassSlug: null,
    name: "Aura of Courage",
    level: 10,
    edition: "EDITION_2024",
    // SRD 5.2: now Immunity to the Frightened condition (not merely "can't be
    // frightened"), scoped to the Aura of Protection; no level-18 sentence.
    description:
      "You and friendly creatures within your Aura of Protection have Immunity to the Frightened condition while you don't have the Incapacitated condition.",
  },
  {
    subclassSlug: null,
    name: "Improved Divine Smite",
    level: 11,
    edition: "EDITION_2014",
    description:
      "Whenever you hit with a melee weapon, you deal an extra 1d8 radiant damage in addition to any other Divine Smite dice.",
  },
  // Improved Divine Smite has NO EDITION_2024 row — replaced outright by
  // Radiant Strikes below (a different name; the "once per turn" limiter is
  // also dropped in 2024).
  {
    subclassSlug: null,
    name: "Radiant Strikes",
    level: 11,
    edition: "EDITION_2024",
    // SRD 5.2, verbatim on the weapon-or-unarmed clause: "a Melee weapon or
    // an Unarmed Strike" (the 2014 row names only "a melee weapon"), and
    // NOT "once per turn" — every qualifying hit adds the die.
    description:
      "Your strikes now carry supernatural power. When you hit a creature with an attack using a Melee weapon or an Unarmed Strike, the target takes an extra 1d8 Radiant damage.",
  },
  {
    subclassSlug: null,
    name: "Cleansing Touch",
    level: 14,
    edition: "EDITION_2014",
    description:
      "As an action, end one spell on yourself or one willing creature within reach. Uses = Charisma modifier per long rest (minimum 1).",
  },
  // Cleansing Touch has NO EDITION_2024 row — replaced outright by Restoring
  // Touch below (a different name and a wholly different mechanic: folds
  // into Lay on Hands' HP pool rather than its own Charisma-modifier pool).
  {
    subclassSlug: null,
    name: "Restoring Touch",
    level: 14,
    edition: "EDITION_2024",
    // SRD 5.2, verbatim on the condition list and the 5-HP-per-condition
    // cost, folded into Lay on Hands rather than a separate pool.
    description:
      "You can use your Lay on Hands to remove the Blinded, Charmed, Deafened, Frightened, Paralyzed, or Stunned condition from a creature: for each condition removed, use 5 Hit Points from your Lay on Hands pool, in addition to any Hit Points used to restore Hit Points.",
  },
  {
    subclassSlug: null,
    name: "Aura Expansion",
    level: 18,
    edition: "EDITION_2024",
    // SRD 5.2, verbatim. NEW in 2024 — the issue's own draft OMITS this
    // feature entirely; authored here for parity with every other class's
    // own L18 aura-expansion row.
    description: "Your Aura of Protection is now a 30-foot Emanation.",
  },
  {
    subclassSlug: null,
    name: "Epic Boon",
    level: 19,
    edition: "EDITION_2024",
    // SRD 5.2, verbatim recommendation. NEW in 2024 — no 2014 counterpart
    // (2014 keeps a plain ASI at 19, already covered by the edition-invariant
    // ASI-level table, not a ClassFeature row). Text only — the feat system
    // itself is deferred (owner decision, mirrors every prior wave's own Epic
    // Boon row). The issue's own draft defers this entirely; authored here
    // for consistency with Fighter/Barbarian/Warlock/Wizard/Cleric.
    description: "You gain an Epic Boon feat of your choice (Boon of Fate recommended). You can take this feat only once.",
  },
];

// ---- Oath of Devotion — PHB'14 p.87 (2014) / SRD 5.2 pp. 49-50 (2024) -----
// 2014: 6 rows (byte-identical to commit 1). 2024: 5 rows — Channel Divinity:
// Turn the Unholy gets NO 2024 successor (its role folds into the base
// class's own Abjure Foes, L9, available to every 2024 Paladin regardless of
// oath).
const DEVOTION_SLUG = slug("paladin-oath-of-devotion");
const DEVOTION_RAW: RawPaladinFeature[] = [
  {
    subclassSlug: DEVOTION_SLUG,
    name: "Oath Spells",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Always-prepared oath spells: Protection from Evil and Good, Sanctuary (L3); Lesser Restoration, Zone of Truth (L5); Beacon of Hope, Dispel Magic (L9); Freedom of Movement, Guardian of Faith (L13); Commune, Flame Strike (L17).",
  },
  // The pre-#1229 EDITION_2024 "Oath Spells" row (an unverified copy of the
  // 2014 text, #1523) retires here (renamed, not edited in place) in favor of
  // Oath of Devotion Spells below, the real SRD 5.2 progression: L3 swaps
  // Sanctuary for Shield of Faith; L5 swaps Lesser Restoration for Aid; L9/
  // 13/17 are unchanged from 2014.
  {
    subclassSlug: DEVOTION_SLUG,
    name: "Oath of Devotion Spells",
    level: 3,
    edition: "EDITION_2024",
    description:
      "Always-prepared oath spells: Protection from Evil and Good, Shield of Faith (3rd level); Aid, Zone of Truth (5th level); Beacon of Hope, Dispel Magic (9th level); Freedom of Movement, Guardian of Faith (13th level); Commune, Flame Strike (17th level).",
  },
  {
    subclassSlug: DEVOTION_SLUG,
    name: "Channel Divinity: Sacred Weapon",
    level: 3,
    edition: "EDITION_2014",
    description:
      "As an action, imbue one weapon with positive energy for 1 minute. It emits bright light (20 ft), dim light (20 ft more), and you add your Charisma modifier to attack rolls. The weapon becomes magical if it isn't already. Uses the Channel Divinity pool.",
  },
  // Channel Divinity: Sacred Weapon has NO EDITION_2024 row under THIS
  // name — SRD 5.2 drops the "Channel Divinity: " prefix from the feature
  // name (the base "Channel Divinity" feature above already carries that
  // word), so its 2024 successor is the differently-named "Sacred Weapon"
  // row below.
  {
    subclassSlug: DEVOTION_SLUG,
    name: "Sacred Weapon",
    level: 3,
    edition: "EDITION_2024",
    // SRD 5.2, verbatim on the trigger (immediately after the Attack action,
    // not "as an action") and the new 10-minute duration (was 1 minute), plus
    // the choose-Radiant-damage rider and the "no longer holding/carrying"
    // end clause.
    description:
      "Immediately after you take the Attack action on your turn, you can imbue one weapon you're holding with positive energy. For 10 minutes, you add your Charisma modifier to attack rolls made with that weapon, and each time you hit with it, you can choose for the weapon to deal Radiant damage instead of one of its other damage types. The weapon also emits bright light in a 20-foot radius and dim light for an additional 20 feet, and it becomes magical if it isn't already. The effect ends early if you aren't holding or carrying the weapon, if you have the Incapacitated condition, or when you finish a Long Rest.",
  },
  {
    subclassSlug: DEVOTION_SLUG,
    name: "Channel Divinity: Turn the Unholy",
    level: 3,
    edition: "EDITION_2014",
    description:
      "As an action, present your holy symbol and speak a prayer. Each fiend or undead within 30 ft must make a Wisdom saving throw or be turned for 1 minute. Uses the Channel Divinity pool.",
  },
  // Channel Divinity: Turn the Unholy has NO EDITION_2024 row — its role
  // folds into the base class's own Abjure Foes (L9), which every 2024
  // Paladin gets regardless of oath.
  {
    subclassSlug: DEVOTION_SLUG,
    name: "Aura of Devotion",
    level: 7,
    edition: "EDITION_2014",
    description: "Friendly creatures within 10 ft can't be charmed while you are conscious (30 ft at level 18).",
  },
  {
    subclassSlug: DEVOTION_SLUG,
    name: "Aura of Devotion",
    level: 7,
    edition: "EDITION_2024",
    // SRD 5.2: Immunity to the Charmed condition, scoped to the Aura of
    // Protection; no level-18 sentence (mirrors the base class's own aura
    // rewording).
    description: "You and friendly creatures within your Aura of Protection have Immunity to the Charmed condition.",
  },
  {
    subclassSlug: DEVOTION_SLUG,
    name: "Purity of Spirit",
    level: 15,
    edition: "EDITION_2014",
    description: "You are always under the effects of a Protection from Evil and Good spell.",
  },
  // Purity of Spirit has NO EDITION_2024 row — replaced outright by Smite of
  // Protection below (a different name and a wholly different mechanic: a
  // Half Cover rider on Divine Smite, not a standing Protection from Evil and
  // Good).
  {
    subclassSlug: DEVOTION_SLUG,
    name: "Smite of Protection",
    level: 15,
    edition: "EDITION_2024",
    // SRD 5.2, verbatim on the trigger and the Half Cover benefit.
    description:
      "Whenever you cast Divine Smite, you and your allies have Half Cover while within your Aura of Protection until the start of your next turn.",
  },
  {
    subclassSlug: DEVOTION_SLUG,
    name: "Holy Nimbus",
    level: 20,
    edition: "EDITION_2014",
    description:
      "As an action, emit an aura of sunlight for 1 minute (60-ft radius, bright light). At the start of each turn, enemies in the aura take 10 radiant damage. You have advantage on saves against spells cast by fiends and undead during this time. Once used, regain on a long rest.",
  },
  {
    subclassSlug: DEVOTION_SLUG,
    name: "Holy Nimbus",
    level: 20,
    edition: "EDITION_2024",
    // SRD 5.2, verbatim on the trigger (Bonus Action, was Action), duration
    // (10 minutes, was 1 minute), and the three named benefits.
    description:
      "As a Bonus Action, you gleam with an aura of divine radiance that lasts for 10 minutes or until you dismiss it (no action required). While the aura lasts, you gain the following benefits: Holy Ward — you have Advantage on saving throws against spells cast by Fiends or Undead; Radiant Damage — whenever a Fiend or Undead hits you with a melee attack, that creature takes 10 Radiant damage; Sunlight — you shed bright light in a 30-foot radius and dim light for an additional 30 feet, and the light counts as sunlight. You can use this feature again only after you finish a Long Rest.",
  },
];

// ---- Oath of the Ancients — PHB'14 p.88 (2014) / mirror-sourced (2024, ----
// NOT in SRD 5.2) --------------------------------------------------------
// Oath of the Ancients is NOT in SRD 5.2 (owner decision, #1229): text below
// is authored only where aidedd.org's Paladin 2024 reference
// (https://www.aidedd.org/en/paladin-2024/) and dungeonmister.com's Oath of
// the Ancients guide
// (https://dungeonmister.com/guides/classes-in-dungeons-dragons/oath-of-the-ancients-paladin-dnd-2024/)
// — two independently-run, non-scraper sites (neither cites the other or a
// common wiki) — agree word-for-mechanic. No contested value for this oath.
// 2014: 6 rows (byte-identical to commit 1). 2024: 5 rows — Channel Divinity:
// Turn the Faithless gets NO 2024 successor (same fold-into-Abjure-Foes
// reasoning as Devotion's own Turn the Unholy).
const ANCIENTS_SLUG = slug("paladin-oath-of-the-ancients");
const ANCIENTS_RAW: RawPaladinFeature[] = [
  {
    subclassSlug: ANCIENTS_SLUG,
    name: "Oath Spells",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Always-prepared oath spells: Ensnaring Strike, Speak with Animals (L3); Moonbeam, Misty Step (L5); Plant Growth, Protection from Energy (L9); Ice Storm, Stoneskin (L13); Commune with Nature, Tree Stride (L17).",
  },
  {
    subclassSlug: ANCIENTS_SLUG,
    name: "Oath of the Ancients Spells",
    level: 3,
    edition: "EDITION_2024",
    // Mirror-sourced: both sources agree the tier list itself is unchanged
    // from 2014, only the feature's own name renames.
    description:
      "Always-prepared oath spells: Ensnaring Strike, Speak with Animals (3rd level); Moonbeam, Misty Step (5th level); Plant Growth, Protection from Energy (9th level); Ice Storm, Stoneskin (13th level); Commune with Nature, Tree Stride (17th level).",
  },
  {
    subclassSlug: ANCIENTS_SLUG,
    name: "Channel Divinity: Nature's Wrath",
    level: 3,
    edition: "EDITION_2014",
    description:
      "As an action, restrain a creature within 10 ft: ethereal vines bind it until it makes a Strength or Dexterity save (DC = paladin spell save DC). Uses the Channel Divinity pool.",
  },
  // Channel Divinity: Nature's Wrath has NO EDITION_2024 row under THIS
  // name — 2024 drops the "Channel Divinity: " prefix (mirrors Devotion's own
  // Sacred Weapon rename), so its 2024 successor is the differently-named
  // "Nature's Wrath" row below.
  {
    subclassSlug: ANCIENTS_SLUG,
    name: "Nature's Wrath",
    level: 3,
    edition: "EDITION_2024",
    // Mirror-sourced (both agree): range widens 10 ft -> 15 ft, targets "each
    // creature of your choice" (was one), the save becomes Strength ONLY
    // (was Str or Dex, target's choice), and the effect is Restrained
    // (repeating save each turn) rather than a fixed-DC bind.
    description:
      "As a Magic action, expend a use of your Channel Divinity to invoke spectral vines. Choose one or more creatures you can see within 15 feet of yourself. Each target must succeed on a Strength saving throw or have the Restrained condition until the vines are destroyed (AC 20; 20 Hit Points; immunity to Poison and Psychic damage) or you use a Bonus Action to release them. A Restrained target repeats the save at the end of each of its turns, ending the effect on itself on a success.",
  },
  {
    subclassSlug: ANCIENTS_SLUG,
    name: "Channel Divinity: Turn the Faithless",
    level: 3,
    edition: "EDITION_2014",
    description:
      "As an action, present your holy symbol. Each fey or fiend within 30 ft must make a Wisdom saving throw or be turned for 1 minute. A turned creature that has nowhere to flee cowers. Uses the Channel Divinity pool.",
  },
  // Channel Divinity: Turn the Faithless has NO EDITION_2024 row — folds into
  // the base class's own Abjure Foes (L9), same reasoning as Devotion's own
  // Turn the Unholy.
  {
    subclassSlug: ANCIENTS_SLUG,
    name: "Aura of Warding",
    level: 7,
    edition: "EDITION_2014",
    description: "You and friendly creatures within 10 ft have resistance to damage from spells (30 ft at level 18).",
  },
  {
    subclassSlug: ANCIENTS_SLUG,
    name: "Aura of Warding",
    level: 7,
    edition: "EDITION_2024",
    // Mirror-sourced: resistance narrows from "damage from spells" to three
    // NAMED damage types (Necrotic, Psychic, Radiant), scoped to the Aura of
    // Protection; no level-18 sentence.
    description:
      "Ancient magic lies so heavily upon you that it forms an eldritch ward: you and friendly creatures within your Aura of Protection have Resistance to Necrotic, Psychic, and Radiant damage.",
  },
  {
    subclassSlug: ANCIENTS_SLUG,
    name: "Undying Sentinel",
    level: 15,
    edition: "EDITION_2014",
    description:
      "When reduced to 0 HP without dying outright, you drop to 1 HP instead. Once used, regain on a long rest. You also don't suffer the aging effects of spells or magical effects.",
  },
  {
    subclassSlug: ANCIENTS_SLUG,
    name: "Undying Sentinel",
    level: 15,
    edition: "EDITION_2024",
    // Mirror-sourced (both agree): 2024 ADDS a healing clause (2014 gave
    // none) and drops the aging clause entirely.
    description:
      "When you are reduced to 0 Hit Points and are not killed outright, you can choose to drop to 1 Hit Point instead, and you regain a number of Hit Points equal to three times your Paladin level. You can use this feature only once until you finish a Long Rest.",
  },
  {
    subclassSlug: ANCIENTS_SLUG,
    name: "Elder Champion",
    level: 20,
    edition: "EDITION_2014",
    description:
      "As an action, take on an aspect of nature for 1 minute: regain 10 HP at the start of each turn; cast spells as a bonus action; enemies within 10 ft have disadvantage on saves against your paladin spells and Channel Divinity. Once used, regain on a long rest.",
  },
  {
    subclassSlug: ANCIENTS_SLUG,
    name: "Elder Champion",
    level: 20,
    edition: "EDITION_2024",
    // Mirror-sourced (both agree): Bonus Action (was Action), duration named
    // (10 minutes, was 1 minute), and the three benefits given their own
    // names.
    description:
      "As a Bonus Action, you gain the appearance of an ancient force of nature for 10 minutes or until you dismiss it (no action required). For the duration, you gain the following benefits: Diminish Defiance — enemies within 10 feet of you have Disadvantage on saving throws against your Paladin spells and Channel Divinity options; Regeneration — at the start of each of your turns, you regain 10 Hit Points; Swift Spells — you can cast your Paladin spells with a casting time of an action as a Bonus Action instead. You can use this feature again only after you finish a Long Rest.",
  },
];

// ---- Oath of Vengeance — PHB'14 p.89 (2014) / mirror-sourced (2024, -------
// NOT in SRD 5.2, CONTESTED VALUES) -----------------------------------------
// Oath of Vengeance is NOT in SRD 5.2 (owner decision, #1229): text below is
// authored only where aidedd.org's Paladin 2024 reference and
// dungeonmister.com's Oath of Vengeance guide
// (https://dungeonmister.com/guides/classes-in-dungeons-dragons/oath-of-vengeance-paladin-dnd-2024/)
// agree. TWO VALUES ARE CONTESTED and deliberately handled per-row below,
// following the `cleric-features.ts` rule (author only the uncontested
// part): Vow of Enmity's action cost (aidedd gives only the effect clause;
// dungeonmister says "use your channel divinity" with no action; a third
// source, dndplaybook, says it "triggers automatically when you strike a
// creature") is OMITTED — the row states only what all three agree on
// (expend a Channel Divinity use, the effect, the duration, the 0-HP
// transfer). Avenging Angel's duration (aidedd/dungeonmister: 10 minutes;
// dndplaybook: 1 hour) uses the 2-of-3 majority value (10 minutes), with the
// disagreement recorded on that row rather than silently picked.
// 2014: 6 rows (byte-identical to commit 1). 2024: 5 rows — Channel Divinity:
// Abjure Enemy gets NO 2024 successor (its role is now the base class's own
// Abjure Foes, L9, available to every 2024 Paladin regardless of oath).
const VENGEANCE_SLUG = slug("paladin-oath-of-vengeance");
const VENGEANCE_RAW: RawPaladinFeature[] = [
  {
    subclassSlug: VENGEANCE_SLUG,
    name: "Oath Spells",
    level: 3,
    edition: "EDITION_2014",
    description:
      "Always-prepared oath spells: Bane, Hunter's Mark (L3); Hold Person, Misty Step (L5); Haste, Protection from Energy (L9); Banishment, Dimension Door (L13); Hold Monster, Scrying (L17).",
  },
  {
    subclassSlug: VENGEANCE_SLUG,
    name: "Oath of Vengeance Spells",
    level: 3,
    edition: "EDITION_2024",
    // Mirror-sourced: both sources agree the tier list is unchanged from
    // 2014, only the feature's own name renames.
    description:
      "Always-prepared oath spells: Bane, Hunter's Mark (3rd level); Hold Person, Misty Step (5th level); Haste, Protection from Energy (9th level); Banishment, Dimension Door (13th level); Hold Monster, Scrying (17th level).",
  },
  {
    subclassSlug: VENGEANCE_SLUG,
    name: "Channel Divinity: Abjure Enemy",
    level: 3,
    edition: "EDITION_2014",
    description:
      "As an action, choose a creature within 60 ft. It makes a Wisdom save (DC = paladin spell save DC) or becomes frightened and its speed is 0 until the end of your next turn (half speed on a success). Fiends and undead have disadvantage on this save. Uses the Channel Divinity pool.",
  },
  // Channel Divinity: Abjure Enemy has NO EDITION_2024 row — its role is now
  // the base class's own Abjure Foes (L9), which every 2024 Paladin gets
  // regardless of oath.
  {
    subclassSlug: VENGEANCE_SLUG,
    name: "Channel Divinity: Vow of Enmity",
    level: 3,
    edition: "EDITION_2014",
    description:
      "As a bonus action, say a vow of enmity against a creature within 10 ft. Gain advantage on attack rolls against it for 1 minute or until it drops to 0 HP. Uses the Channel Divinity pool.",
  },
  // Channel Divinity: Vow of Enmity has NO EDITION_2024 row under THIS
  // name — 2024 drops the "Channel Divinity: " prefix (mirrors Devotion's own
  // Sacred Weapon / Ancients' own Nature's Wrath renames), so its 2024
  // successor is the differently-named "Vow of Enmity" row below.
  {
    subclassSlug: VENGEANCE_SLUG,
    name: "Vow of Enmity",
    level: 3,
    edition: "EDITION_2024",
    // Mirror-sourced, CONTESTED VALUE (see file section header): the action
    // cost is deliberately OMITTED — three secondary sources disagree on it
    // (aidedd states only the effect; dungeonmister says "use your channel
    // divinity" with no action named; dndplaybook says it triggers
    // automatically on a strike). This row states only what all three agree
    // on: expend a Channel Divinity use, Advantage on attack rolls for 1
    // minute, and the NEW-in-2024 transfer to a fresh target within 30 ft if
    // the vowed creature drops to 0 HP.
    description:
      "Expend a use of your Channel Divinity to utter a vow of enmity against a creature you can see within 10 feet of yourself. You have Advantage on attack rolls against that creature for 1 minute. If the creature drops to 0 Hit Points before this vow ends, you can transfer the vow to a new creature within 30 feet of you, provided you can see the new target.",
  },
  {
    subclassSlug: VENGEANCE_SLUG,
    name: "Relentless Avenger",
    level: 7,
    edition: "EDITION_2014",
    description:
      "When you hit with an opportunity attack, you can move up to half your speed (without provoking opportunity attacks) as part of the same reaction.",
  },
  {
    subclassSlug: VENGEANCE_SLUG,
    name: "Relentless Avenger",
    level: 7,
    edition: "EDITION_2024",
    // Mirror-sourced (both agree): reworked from "you move" to "the target's
    // Speed drops to 0" — a REWORK, not merely a wording refresh.
    description:
      "Your battle instincts sharpen when you cross blades with your foes. When you hit a creature with an Opportunity Attack, you can reduce that creature's Speed to 0 until the end of the current turn.",
  },
  {
    subclassSlug: VENGEANCE_SLUG,
    name: "Soul of Vengeance",
    level: 15,
    edition: "EDITION_2014",
    description:
      "When a creature under your Vow of Enmity makes an attack, use your reaction to make a melee weapon attack against it.",
  },
  {
    subclassSlug: VENGEANCE_SLUG,
    name: "Soul of Vengeance",
    level: 15,
    edition: "EDITION_2024",
    // Mirror-sourced (both agree): triggers on the vowed creature's hit OR
    // miss (2014: only when it attacks and by implication hits — this row's
    // 2014 twin is silent on misses, and 2024 makes the "or misses" clause
    // explicit).
    description:
      "You can maintain your focus on a foe. When the creature under the effect of your Vow of Enmity hits or misses with an attack, you can use your Reaction to make a melee attack against that creature if it's within your reach.",
  },
  {
    subclassSlug: VENGEANCE_SLUG,
    name: "Avenging Angel",
    level: 20,
    edition: "EDITION_2014",
    description:
      "As an action, assume an angelic form for 1 hour: fly speed 60 ft; enemies within 30 ft who can see you must make a Wisdom save or be frightened of you for 1 minute. Once used, regain on a long rest.",
  },
  {
    subclassSlug: VENGEANCE_SLUG,
    name: "Avenging Angel",
    level: 20,
    edition: "EDITION_2024",
    // Mirror-sourced, CONTESTED VALUE (see file section header): duration is
    // 10 minutes per two of three sources (aidedd, dungeonmister); a third
    // (dndplaybook) says 1 hour. Uses the 2-of-3 majority (10 minutes) rather
    // than omitting it outright, with the disagreement recorded here.
    // Uncontested: Bonus Action (was Action), 60-ft Fly Speed WITH hover
    // (2014 names no hover), the Frightful Aura trigger widens to "starts its
    // turn within 30 ft OR enters that area" (2014: only "within 30 ft" at
    // the moment of casting), and the new Advantage-vs-Frightened rider.
    description:
      "As a Bonus Action, you undergo a transformation for 10 minutes or until you dismiss it (no action required). You grow angelic wings, giving you a Fly Speed of 60 feet with the ability to hover. While transformed, you also emanate frightful power: whenever a creature hostile to you starts its turn within 30 feet of you or enters that area for the first time on a turn, it must succeed on a Wisdom saving throw or have the Frightened condition until your transformation ends. You have Advantage on attack rolls against creatures that have the Frightened condition. You can use this feature again only after you finish a Long Rest.",
  },
];

export const PALADIN_FEATURES: ClassFeatureSeedRow[] = [...BASE_RAW, ...DEVOTION_RAW, ...ANCIENTS_RAW, ...VENGEANCE_RAW].flatMap(expand);
