// PHB'14 (2014) Ranger spell list — content slice of epic #1517 (#1721,
// the LAST per-class content slice; #1722 closes the epic).
// Per the epic's row-ownership rule (tie-break Wizard > Cleric > Druid > Bard >
// Sorcerer > Warlock > Paladin > Ranger), Ranger is LAST priority — this file
// authors only spells where NO other class (all seven higher-priority ones)
// is also on the PHB'14 list.
//
// Source: dnd5eapi.co's 2014 spell set (/api/2014/classes/ranger/spells,
// which enumerates exactly 37 spells — Ranger's SRD 5.1 subset, levels 1-5,
// no cantrips, half-caster). Of those 37, 36 already carry ranger membership
// in another slice's file (verified individually — see the completeness test
// in spells-2014-ranger-data.test.ts): 9 in druid.ts, 1 in wizard.ts, 26 in
// shared.ts. The 37th, Hunter's Mark, sits on NO other class's PHB'14 list
// (dnd5eapi.co's own per-class check across all seven higher-priority classes
// confirms zero overlap) and was NOT yet authored anywhere — a genuine gap in
// the SRD dataset's own class-tagging, not a prior slice's miss (Ranger's
// slice is the first and only place it could be owned) — authored below,
// verbatim SRD 5.1 text via dnd5eapi.
//
// Beyond the API's 37, a manual sweep for real PHB'14 Ranger spells the
// SRD-only dataset omits entirely (the same class of gap prior slices found
// — Warlock's Hex/Armor of Agathys/Arms of Hadar/Hunger of Hadar, Sorcerer's
// Witch Bolt, Paladin's 13 smite/aura spells) used 5etools' generated
// spell-source lookup (data/generated/gendata-spell-source-lookup.json on
// GitHub, which the 5e.tools spell filter itself is built from — an
// authoritative, structured class-list index rather than a prose wiki page)
// to enumerate every spell carrying base "Ranger" class access in the PHB.
// That lookup returns 46 spells for Ranger, not 37 — 9 more than dnd5eapi's
// SRD subset:
//   - Zephyr Strike and Steel Wind Strike, both real 5e Ranger spells, were
//     CONSIDERED and REJECTED as out-of-scope: dndbeyond.com's own
//     compendium redirect (unauthenticated, so it 303s to the marketplace
//     category gating the content) sends both to
//     marketplace.dndbeyond.com/category/xanathars-guide-to-everything, not
//     players-handbook — confirmed Xanathar's Guide to Everything additions,
//     not PHB'14 core (same exclusion shape as Paladin's Ceremony).
//   - The other 8 all confirmed via the SAME dndbeyond redirect method
//     landing on marketplace.dndbeyond.com/category/players-handbook (i.e.
//     genuinely PHB'14 core, not XGE), cross-checked word-for-word against a
//     second source (dnd5e.wikidot.com's own per-spell page, which also
//     confirms each one's "Spell Lists" class-access line carries no
//     "(Optional)" tag):
//     - Ensnaring Strike, Hail of Thorns (L1), Cordon of Arrows (L2),
//       Lightning Arrow, Conjure Barrage (L3), Conjure Volley, Swift Quiver
//       (L5) are Ranger-ONLY on the base class lookup — authored below.
//     - Grasping Vine (L4) and Beast Sense (L2) are the lookup's only two
//       Ranger spells that ALSO carry Druid base-class access (no
//       "(Optional)" tag on either) — Druid outranks Ranger in the
//       tie-break, so both are Druid-owned rows, NOT authored here. Neither
//       was previously authored anywhere (a genuine gap in the already-
//       merged Druid slice, #1716, whose own SRD-only dnd5eapi sweep couldn't
//       have found them either) — added to druid.ts by this slice, tagged
//       ["druid", "ranger"], per the row-ownership rule that a row lives in
//       its owner's file even when a later slice is the one that finds the
//       gap (matching this epic's own Grasping Vine/Beast Sense fix note in
//       druid.ts's header).
//
// Net: 8 rows owned here (1 SRD: Hunter's Mark; 7 hand-transcribed:
// Ensnaring Strike, Hail of Thorns, Cordon of Arrows, Lightning Arrow,
// Conjure Barrage, Conjure Volley, Swift Quiver), 2 rows added to druid.ts
// by this slice (Beast Sense, Grasping Vine), 46 total PHB'14 Ranger spells
// across all authoring files (36 pre-existing + these 10 = 46 — see
// spells-2014-ranger-data.test.ts for the permanent membership-completeness
// guard). Ranger is a half-caster capped at 5th-level spells in PHB'14
// (spells of level 6-9 don't exist on this list) and has no cantrips.
import type { CatalogSpell } from "../spells.js";

export const RANGER_SPELLS_2014: CatalogSpell[] = [
  // ── Level 0 — none (Ranger has no PHB'14 cantrips, half-caster) ──
  // ── Level 1 ────────────────────────────────────────────────────────────
  // PHB'14 p. 237. Not in dnd5eapi/open5e's SRD dataset (confirmed via
  // dndbeyond.com's marketplace redirect: players-handbook, not XGE).
  // Cross-checked word-for-word against a second source
  // (dnd5e.wikidot.com/spell:ensnaring-strike), which corroborates 5etools'
  // own PHB-sourced text exactly, including the +1d6-per-upcast-level
  // clause. A rider precondition ("next hit") gates a Strength save, and the
  // damage itself is a RECURRING per-turn tick while restrained, not a
  // single cast-time instance — same shape as Searing Smite (paladin.ts) —
  // so no effectKind is set despite the genuine "Strength saving throw"
  // sentence; documented as a conditional/multi-effect exception in this
  // slice's data test.
  {
    name: "Ensnaring Strike",
    level: 1,
    school: "conjuration",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "The next time you hit a creature with a weapon attack before this spell ends, a writhing mass of thorny vines appears at the point of impact, and the target must succeed on a Strength saving throw or be restrained by the magical vines until the spell ends. A Large or larger creature has advantage on this saving throw. If the target succeeds on the save, the vines shrivel away. While restrained by this spell, the target takes 1d6 piercing damage at the start of each of its turns. A creature restrained by the vines or one that can touch the creature can use its action to make a Strength check against your spell save DC. On a success, the target is freed. At Higher Levels. If you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d6 for each slot level above 1st.",
    classes: ["ranger"],
    components: { verbal: true, somatic: false, material: false },
    attackType: "save",
    saveAbility: "strength",
  },
  // PHB'14 p. 249. Not in dnd5eapi/open5e's SRD dataset (confirmed
  // players-handbook via the same dndbeyond redirect method). Cross-checked
  // word-for-word against a second source
  // (dnd5e.wikidot.com/spell:hail-of-thorns), which corroborates 5etools'
  // own PHB-sourced text exactly, including the "to a maximum of 6d10"
  // upcast cap. A rider precondition ("next hit with a ranged weapon
  // attack") gates a genuine Dexterity save-for-half AoE burst — the whole
  // effect only resolves if a later attack lands, same "next hit" shape as
  // Divine Favor/Branding Smite (paladin.ts) — so no effectKind/attackType
  // is set; documented as a conditional/multi-effect exception.
  {
    name: "Hail of Thorns",
    level: 1,
    school: "conjuration",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "The next time you hit a creature with a ranged weapon attack before the spell ends, this spell creates a rain of thorns that sprouts from your ranged weapon or ammunition. In addition to the normal effect of the attack, the target of the attack and each creature within 5 feet of it must make a Dexterity saving throw. A creature takes 1d10 piercing damage on a failed save, or half as much damage on a successful one. At Higher Levels. If you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d10 for each slot level above 1st (to a maximum of 6d10).",
    classes: ["ranger"],
    components: { verbal: true, somatic: false, material: false },
  },
  // SRD 5.1 (dnd5eapi.co/api/2014/spells/hunters-mark; also confirmed
  // "srd": true on 5etools' own PHB entry). Cross-checked word-for-word
  // against a second source (dnd5e.wikidot.com/spell:hunters-mark), which
  // corroborates dnd5eapi's text exactly, including the two-tier
  // duration-extension upcast clause. Ranger-only on every other class's
  // PHB'14 list (Paladin's access is via the Oath of Vengeance SUBCLASS
  // grant, out of this epic's scope per seed-granted-spells.ts). A rider on
  // ALL of the caster's future weapon attacks for the duration (not a
  // single cast-time instance), same shape as Divine Favor (paladin.ts) — no
  // effectKind is set despite the "extra 1d6 damage" phrase; documented as a
  // conditional/multi-effect exception. NOTE the 2024 SPELLS row
  // (spells.ts) rewrites this as "Force damage" and a flat "the base 1-hour
  // duration increases with slot level" summary — genuine 2024-only
  // revisions not reused here (2014's damage is untyped "damage," and the
  // real upcast text is the two explicit 8-hour/24-hour tiers above).
  {
    name: "Hunter's Mark",
    level: 1,
    school: "divination",
    castingTime: "1 bonus action",
    range: "90 feet",
    duration: "Up to 1 hour",
    concentration: true,
    description:
      "You choose a creature you can see within range and mystically mark it as your quarry. Until the spell ends, you deal an extra 1d6 damage to the target whenever you hit it with a weapon attack, and you have advantage on any Wisdom (Perception) or Wisdom (Survival) check you make to find it. If the target drops to 0 hit points before this spell ends, you can use a bonus action on a subsequent turn of yours to mark a new creature. At Higher Levels. When you cast this spell using a spell slot of 3rd or 4th level, you can maintain your concentration on the spell for up to 8 hours. When you use a spell slot of 5th level or higher, you can maintain your concentration on the spell for up to 24 hours.",
    classes: ["ranger"],
    components: { verbal: true, somatic: false, material: false },
  },
  // ── Level 2 ────────────────────────────────────────────────────────────
  // PHB'14 p. 228. Not in dnd5eapi/open5e's SRD dataset (confirmed
  // players-handbook via the dndbeyond redirect). Cross-checked
  // word-for-word against a second source
  // (dnd5e.wikidot.com/spell:cordon-of-arrows), which corroborates 5etools'
  // own PHB-sourced text exactly; the upcast clause scales ammunition COUNT,
  // not damage dice. A durable trap that re-triggers per creature over its
  // whole 8-hour duration (not a single cast-time instance) — same
  // "durable/multi-trigger, no single effectKind" shape as Spike Growth and
  // Wall of Thorns (druid.ts) — so no effectKind/attackType is set despite
  // the genuine "Dexterity saving throw" and "1d6 piercing damage" phrases;
  // documented as a conditional/multi-effect exception.
  {
    name: "Cordon of Arrows",
    level: 2,
    school: "transmutation",
    castingTime: "1 action",
    range: "5 feet",
    duration: "8 hours",
    description:
      "You plant four pieces of nonmagical ammunition—arrows or crossbow bolts—in the ground within range and lay magic upon them to protect an area. Until the spell ends, whenever a creature other than you comes within 30 feet of the ammunition for the first time on a turn or ends its turn there, one piece of ammunition flies up to strike it. The creature must succeed on a Dexterity saving throw or take 1d6 piercing damage. The piece of ammunition is then destroyed. The spell ends when no ammunition remains. When you cast this spell, you can designate any creatures you choose, and the spell ignores them. At Higher Levels. When you cast this spell using a spell slot of 3rd level or higher, the amount of ammunition that can be affected increases by two for each slot level above 2nd.",
    classes: ["ranger"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "four or more arrows or bolts" },
  },
  // ── Level 3 ────────────────────────────────────────────────────────────
  // PHB'14 p. 255. Not in dnd5eapi/open5e's SRD dataset (confirmed
  // players-handbook via the dndbeyond redirect). Cross-checked
  // word-for-word against a second source
  // (dnd5e.wikidot.com/spell:lightning-arrow), which corroborates 5etools'
  // own PHB-sourced text exactly, including the "both effects" upcast
  // clause. TWO separate damage instances on ONE rider precondition (4d8
  // lightning replacing the weapon's own damage on an attack roll, PLUS a
  // separate 2d8 lightning Dexterity save-for-half AoE burst around the
  // target) — no single effectKind/damageType/attackType captures both, same
  // "two damage components, no single instance" shape as Destructive Wave
  // (paladin.ts); documented as a conditional/multi-effect exception.
  {
    name: "Lightning Arrow",
    level: 3,
    school: "transmutation",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "The next time you make a ranged weapon attack during the spell's duration, the weapon's ammunition, or the weapon itself if it's a thrown weapon, transforms into a bolt of lightning. Make the attack roll as normal. The target takes 4d8 lightning damage on a hit, or half as much damage on a miss, instead of the weapon's normal damage. Whether you hit or miss, each creature within 10 feet of the target must make a Dexterity saving throw. Each of these creatures takes 2d8 lightning damage on a failed save, or half as much damage on a successful one. The piece of ammunition or weapon then returns to its normal form. At Higher Levels. When you cast this spell using a spell slot of 4th level or higher, the damage for both effects of the spell increases by 1d8 for each slot level above 3rd.",
    classes: ["ranger"],
    components: { verbal: true, somatic: true, material: false },
  },
  // PHB'14 p. 225. Not in dnd5eapi/open5e's SRD dataset (confirmed
  // players-handbook via the dndbeyond redirect). Cross-checked
  // word-for-word against a second source
  // (dnd5e.wikidot.com/spell:conjure-barrage), which corroborates 5etools'
  // own PHB-sourced text exactly; neither source carries an "At Higher
  // Levels" clause. The damage TYPE is variable ("the same as that of the
  // weapon or ammunition used as a component") rather than a single fixed
  // type — can't be hardcoded into one damageType any more than Destructive
  // Wave's "your choice" dual type (paladin.ts) — so no effectKind/
  // damageType is set despite the fixed 3d8 dice and genuine Dexterity
  // save-for-half; documented as a conditional/multi-effect exception.
  {
    name: "Conjure Barrage",
    level: 3,
    school: "conjuration",
    castingTime: "1 action",
    range: "Self (60-ft cone)",
    duration: "Instantaneous",
    description:
      "You throw a nonmagical weapon or fire a piece of nonmagical ammunition into the air to create a cone of identical weapons that shoot forward and then disappear. Each creature in a 60-foot cone must succeed on a Dexterity saving throw. A creature takes 3d8 damage on a failed save, or half as much damage on a successful one. The damage type is the same as that of the weapon or ammunition used as a component.",
    classes: ["ranger"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "one piece of ammunition or a thrown weapon" },
  },
  // ── Level 4 — none owned (Grasping Vine, Ranger's only 4th-level PHB'14
  //    spell, is Druid-owned per the tie-break — see druid.ts; membership
  //    verified in this slice's completeness test) ──
  // ── Level 5 ────────────────────────────────────────────────────────────
  // PHB'14 p. 226. Not in dnd5eapi/open5e's SRD dataset (confirmed
  // players-handbook via the dndbeyond redirect). Cross-checked
  // word-for-word against a second source
  // (dnd5e.wikidot.com/spell:conjure-volley), which corroborates 5etools'
  // own PHB-sourced text exactly; neither source carries an "At Higher
  // Levels" clause. Same variable-damage-type shape as Conjure Barrage above
  // — no effectKind/damageType; documented as a conditional/multi-effect
  // exception.
  {
    name: "Conjure Volley",
    level: 5,
    school: "conjuration",
    castingTime: "1 action",
    range: "150 feet",
    duration: "Instantaneous",
    description:
      "You fire a piece of nonmagical ammunition from a ranged weapon or throw a nonmagical weapon into the air and choose a point within range. Hundreds of duplicates of the ammunition or weapon fall in a volley from above and then disappear. Each creature in a 40-foot-radius, 20-foot-high cylinder centered on that point must make a Dexterity saving throw. A creature takes 8d8 damage on a failed save, or half as much damage on a successful one. The damage type is the same as that of the ammunition or weapon.",
    classes: ["ranger"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "one piece of ammunition or one thrown weapon" },
  },
  // PHB'14 p. 279. Not in dnd5eapi/open5e's SRD dataset (confirmed
  // players-handbook via the dndbeyond redirect). Cross-checked
  // word-for-word against a second source
  // (dnd5e.wikidot.com/spell:swift-quiver), which corroborates 5etools' own
  // PHB-sourced text exactly; neither source carries an "At Higher Levels"
  // clause. Pure action-economy utility (grants extra ranged attacks via a
  // bonus action) — no damage/save at all, matching Find Steed's
  // (paladin.ts) clean no-effectKind utility shape.
  {
    name: "Swift Quiver",
    level: 5,
    school: "transmutation",
    castingTime: "1 bonus action",
    range: "Touch",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "You transmute your quiver so it produces an endless supply of nonmagical ammunition, which seems to leap into your hand when you reach for it. On each of your turns until the spell ends, you can use a bonus action to make two attacks with a weapon that uses ammunition from the quiver. Each time you make such a ranged attack, your quiver magically replaces the piece of ammunition you used with a similar piece of nonmagical ammunition. Any pieces of ammunition created by this spell disintegrate when the spell ends. If the quiver leaves your possession, the spell ends.",
    classes: ["ranger"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "a quiver containing at least one piece of ammunition" },
  },
  // ── Level 6-9 — none (Ranger caps at 5th-level spells, half-caster) ──
];
