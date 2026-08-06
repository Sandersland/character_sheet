// PHB'14 (2014) Paladin spell list — content slice of epic #1517 (#1720).
// Per the epic's row-ownership rule (tie-break Wizard > Cleric > Druid > Bard >
// Sorcerer > Warlock > Paladin > Ranger), Paladin is 7th priority (2nd-to-last)
// — this file authors only the spells where NO higher-priority class (Wizard,
// Cleric, Druid, Bard, Sorcerer, Warlock) is also on the PHB'14 list.
//
// Source: dnd5eapi.co's 2014 spell set (/api/2014/classes/paladin/spells, which
// enumerates 31 spells) plus a manual sweep for real PHB'14 Paladin spells that
// dataset omits entirely (the same gap class prior slices found — Warlock's
// Hex/Armor of Agathys/Arms of Hadar/Hunger of Hadar, Sorcerer's Witch Bolt):
//   - Of the 31 in dnd5eapi's list, 28 sit on 2+ class lists with a
//     higher-priority owner and are ALREADY authored + membership-tagged
//     "paladin" in shared.ts/cleric.ts/bard.ts/wizard.ts — individually
//     verified below, zero edits needed to any of those four files for this
//     slice: Bless, Command, Detect Evil and Good, Shield of Faith, Aid,
//     Revivify, Death Ward, Dispel Evil and Good (cleric.ts); Cure Wounds,
//     Detect Magic, Detect Poison and Disease, Protection from Evil and Good,
//     Purify Food and Drink, Lesser Restoration, Locate Object, Protection
//     from Poison, Zone of Truth, Create Food and Water, Daylight, Dispel
//     Magic, Magic Circle, Remove Curse, Banishment, Locate Creature, Geas,
//     Raise Dead (shared.ts); Heroism (bard.ts); Magic Weapon (wizard.ts).
//   - The remaining 3 of the 31 (Divine Favor, Find Steed, Branding Smite)
//     are genuinely Paladin-only and authored below.
//
// Beyond the API's 31, a manual sweep (cross-checked class-list membership
// per spell via roll20.net's compendium redirect, which routes each spell to
// the exact sourcebook bundle required to unlock it — Player's Handbook vs.
// Xanathar's/Tasha's/SCAG/UA — and independently via dnd5e.wikidot.com's own
// "Spell Lists" line, which tags a later book's class-list ADDITION as
// "(Optional)") found 12 more real PHB'14 Paladin-only spells absent from
// dnd5eapi's dataset entirely: Compelled Duel, Searing Smite, Thunderous
// Smite, Wrathful Smite (all 1st level); Aura of Vitality, Blinding Smite,
// Crusader's Mantle, Elemental Weapon (all 3rd level); Aura of Purity,
// Staggering Smite (4th level); Banishing Smite, Circle of Power, Destructive
// Wave (5th level) — 13, not 12; see the per-row citations below.
//
// Two spells this sweep considered and REJECTED as out-of-scope (2014-real but
// not PHB'14-core): Ceremony (roll20 redirects to the Xanathar's Guide to
// Everything bundle, not Player's Handbook) and, initially suspected but
// disproven, Compelled Duel itself (roll20 AND D&D Beyond both redirect it to
// the Player's Handbook bundle — it reads as an Oath of the Crown "oath spell"
// in SCAG, but the spell itself, like Bane on the Oath of Vengeance list, was
// always on Paladin's general PHB'14 list; SCAG only made it auto-prepared for
// that oath). Aura of Vitality/Aura of Purity's apparent Cleric/Druid access
// (5e-spellbook.app lists "Cleric, Druid, Paladin" for 2014) is likewise a
// later-book ADDITION — dnd5e.wikidot.com's own per-spell page tags Cleric and
// Druid "(Optional)" there, i.e. a Tasha's Cauldron of Everything optional
// expanded-list grant, not core 2014 access — so both stay Paladin-only rows.
// Elemental Weapon similarly shows Druid/Ranger access tagged "(Optional)" and
// Artificer (a class that didn't exist in 2014) — core 2014 access is
// Paladin-only.
//
// Net: 16 rows owned here (3 API-derived: Divine Favor, Find Steed, Branding
// Smite; 13 hand-transcribed, each cross-checked word-for-word against a
// second source beyond the primary source used — 5e-spellbook.app, which
// publishes 2014-vs-2024 diffed spell text — namely dnd5e.wikidot.com), 44
// total PHB'14 Paladin spells across all authoring files (28 shared/other-
// class-owned + 16 owned here — see spells-2014-paladin-data.test.ts for the
// permanent membership-completeness guard). Paladin is a half-caster capped at
// 5th-level spells in PHB'14 (spells of level 6-9 don't exist on this list),
// and has no cantrips.
import type { CatalogSpell } from "../spells.js";

export const PALADIN_SPELLS_2014: CatalogSpell[] = [
  // ── Level 0 — none (Paladin has no PHB'14 cantrips) ──
  // ── Level 1 ────────────────────────────────────────────────────────────
  // PHB'14 p. 234. dnd5eapi-derived (paladin-only in its own classes[]). A
  // per-hit RIDER on the caster's own future weapon attacks for the spell's
  // duration, not a direct spell-cast damage instance — same shape as Hex
  // (warlock.ts) — so no effectKind/attackType is set; documented as a
  // conditional/multi-effect exception in this slice's data test.
  {
    name: "Divine Favor",
    level: 1,
    school: "evocation",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "Your prayer empowers you with divine radiance. Until the spell ends, your weapon attacks deal an extra 1d4 radiant damage on a hit.",
    classes: ["paladin"],
    components: { verbal: true, somatic: true, material: false },
  },
  // PHB'14 p. 224. Not in dnd5eapi/open5e's dataset. Cross-checked
  // word-for-word against a second source (dnd5e.wikidot.com/spell:compelled-
  // duel), which corroborates 5e-spellbook.app's 2014-edition text exactly.
  // Genuinely a save-gated non-damage effect (Wisdom save controls whether
  // the target is compelled at all) — same shape as Command (cleric.ts):
  // attackType "save" + saveAbility, no effectKind.
  {
    name: "Compelled Duel",
    level: 1,
    school: "enchantment",
    castingTime: "1 bonus action",
    range: "30 feet",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "You attempt to compel a creature into a duel. One creature that you can see within range must make a Wisdom saving throw. On a failed save, the creature is drawn to you, compelled by your divine demand. For the duration, it has disadvantage on attack rolls against creatures other than you, and must make a Wisdom saving throw each time it attempts to move to a space that is more than 30 feet away from you; if it succeeds on this saving throw, this spell doesn't restrict the target's movement for that turn. The spell ends if you attack any other creature, if you cast a spell that targets a hostile creature other than the target, if a creature friendly to you damages the target or casts a harmful spell on it, or if you end your turn more than 30 feet away from the target.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
    attackType: "save",
    saveAbility: "wisdom",
  },
  // PHB'14 p. 274. Not in dnd5eapi/open5e's dataset. Cross-checked
  // word-for-word against a second source (dnd5e.wikidot.com/spell:searing-
  // smite), which corroborates 5e-spellbook.app's 2014-edition text exactly,
  // including the +1d6-per-upcast-level clause. The initial hit's damage is
  // unconditional (a per-hit rider, not a direct spell-cast instance); the
  // ongoing burn is a SEPARATE Constitution save each turn — a genuine
  // multi-effect shape (like Hunger of Hadar, warlock.ts) — so no
  // effectKind/attackType is set; documented as a conditional/multi-effect
  // exception in this slice's data test. dnd5e.wikidot.com also notes an
  // "(Optional)" Ranger access (a later-book addition) not present in 2014
  // core, so this row stays Paladin-only.
  {
    name: "Searing Smite",
    level: 1,
    school: "evocation",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "The next time you hit a creature with a melee weapon attack during the spell's duration, your weapon flares with white-hot intensity, and the attack deals an extra 1d6 fire damage to the target and causes the target to ignite in flames. At the start of each of its turns until the spell ends, the target must make a Constitution saving throw. On a failed save, it takes 1d6 fire damage. On a successful save, the spell ends. If the target or a creature within 5 feet of it uses an action to put out the flames, or if some other effect douses the flames (such as the target being submerged in water), the spell ends. At Higher Levels. When you cast this spell using a spell slot of 2nd level or higher, the initial extra damage dealt by the attack increases by 1d6 for each slot level above 1st.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // PHB'14 p. 282. Not in dnd5eapi/open5e's dataset. Cross-checked
  // word-for-word against a second source (dnd5e.wikidot.com/spell:
  // thunderous-smite), which corroborates 5e-spellbook.app's 2014-edition
  // text exactly; neither source carries an "At Higher Levels" clause. The
  // damage is unconditional on hit; the Strength save only gates the
  // separate push/prone rider — a multi-effect shape, no effectKind/
  // attackType; documented as a conditional/multi-effect exception.
  {
    name: "Thunderous Smite",
    level: 1,
    school: "evocation",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "The first time you hit with a melee weapon attack during this spell's duration, your weapon rings with thunder that is audible within 300 feet of you, and the attack deals an extra 2d6 thunder damage to the target. Additionally, if the target is a creature, it must succeed on a Strength saving throw or be pushed 10 feet away from you and knocked prone.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // PHB'14 p. 289. Not in dnd5eapi/open5e's dataset. Cross-checked
  // word-for-word against a second source (dnd5e.wikidot.com/spell:wrathful-
  // smite), which corroborates 5e-spellbook.app's 2014-edition text exactly;
  // neither source carries an "At Higher Levels" clause. The damage is
  // unconditional; the Wisdom save only gates the separate fear rider — a
  // multi-effect shape, no effectKind/attackType; documented as a
  // conditional/multi-effect exception.
  {
    name: "Wrathful Smite",
    level: 1,
    school: "evocation",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "The next time you hit with a melee weapon attack during this spell's duration, your attack deals an extra 1d6 psychic damage. Additionally, if the target is a creature, it must make a Wisdom saving throw or be frightened of you until the spell ends. As an action, the creature can make a Wisdom check against your spell save DC to steel its resolve and end this spell.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // ── Level 2 ────────────────────────────────────────────────────────────
  // PHB'14 p. 240. dnd5eapi-derived (paladin-only in its own classes[]).
  // higher_level: [] confirmed by the API — a purely instantaneous summon,
  // no upcast clause, no damage/save at all. The API's own text genericizes
  // "DM" to "GM" (the same cross-system scraping artifact prior slices'
  // guards catch) — corrected back to "DM" here, matching real PHB'14 text.
  {
    name: "Find Steed",
    level: 2,
    school: "conjuration",
    castingTime: "10 minutes",
    range: "30 feet",
    duration: "Instantaneous",
    description:
      "You summon a spirit that assumes the form of an unusually intelligent, strong, and loyal steed, creating a long-lasting bond with it. Appearing in an unoccupied space within range, the steed takes on a form that you choose, such as a warhorse, a pony, a camel, an elk, or a mastiff. (Your DM might allow other animals to be summoned as steeds.) The steed has the statistics of the chosen form, though it is a celestial, fey, or fiend (your choice) instead of its normal type. Additionally, if your steed has an Intelligence of 5 or less, its Intelligence becomes 6, and it gains the ability to understand one language of your choice that you speak. Your steed serves you as a mount, both in combat and out, and you have an instinctive bond with it that allows you to fight as a seamless unit. While mounted on your steed, you can make any spell you cast that targets only you also target your steed. When the steed drops to 0 hit points, it disappears, leaving behind no physical form. You can also dismiss your steed at any time as an action, causing it to disappear. In either case, casting this spell again summons the same steed, restored to its hit point maximum. While your steed is within 1 mile of you, you can communicate with it telepathically. You can't have more than one steed bonded by this spell at a time. As an action, you can release the steed from its bond at any time, causing it to disappear.",
    classes: ["paladin"],
    components: { verbal: true, somatic: true, material: false },
  },
  // PHB'14 p. 220. dnd5eapi-derived (paladin-only in its own classes[]);
  // cross-checked against a second source (dnd5e.wikidot.com/spell:branding-
  // smite), which corroborates the API's text and upcast clause exactly. A
  // per-hit rider (no effectKind/attackType), same reasoning as Divine Favor
  // above; documented as a conditional/multi-effect exception (the "extra
  // 2d6 radiant damage" phrase would otherwise trip the prose-vs-field
  // audit's damage-phrase check).
  {
    name: "Branding Smite",
    level: 2,
    school: "evocation",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "The next time you hit a creature with a weapon attack before this spell ends, the weapon gleams with astral radiance as you strike. The attack deals an extra 2d6 radiant damage to the target, which becomes visible if it's invisible, and the target sheds dim light in a 5-foot radius and can't become invisible until the spell ends. At Higher Levels. When you cast this spell using a spell slot of 3rd level or higher, the extra damage increases by 1d6 for each slot level above 2nd.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // ── Level 3 ────────────────────────────────────────────────────────────
  // PHB'14 p. 216. Not in dnd5eapi/open5e's dataset. Cross-checked
  // word-for-word against a second source (dnd5e.wikidot.com/spell:aura-of-
  // vitality), which corroborates 5e-spellbook.app's 2014-edition text
  // exactly. dnd5e.wikidot.com tags this spell's Cleric AND Druid access
  // "(Optional)" — a Tasha's Cauldron of Everything expanded-list addition,
  // not 2014 core — so core 2014 access is Paladin-only, confirmed via
  // roll20.net's compendium redirect to the Player's Handbook bundle (not
  // SCAG, despite this spell's associaton with the SCAG-introduced Oath of
  // the Crown's oath-spell list — same "already on the general list, oath
  // just auto-prepares it" shape as Compelled Duel above). A repeatable
  // per-turn bonus-action heal trigger, not a single cast-time roll — no
  // effectKind (matches Aid's "inexpressible as a dice heal" precedent).
  {
    name: "Aura of Vitality",
    level: 3,
    school: "evocation",
    castingTime: "1 action",
    range: "Self (30-foot radius)",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "Healing energy radiates from you in an aura with a 30-foot radius. Until the spell ends, the aura moves with you, centered on you. You can use a bonus action to cause one creature in the aura (including you) to regain 2d6 hit points.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // PHB'14 p. 219. Not in dnd5eapi/open5e's dataset. Cross-checked
  // word-for-word against a second source (dnd5e.wikidot.com/spell:blinding-
  // smite), which corroborates 5e-spellbook.app's 2014-edition text exactly;
  // neither source carries an "At Higher Levels" clause. Damage is
  // unconditional; the Constitution save only gates the separate blind
  // rider (with its own repeated end-of-turn save) — multi-effect shape, no
  // effectKind/attackType; documented as a conditional/multi-effect
  // exception.
  {
    name: "Blinding Smite",
    level: 3,
    school: "evocation",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "The next time you hit a creature with a melee weapon attack during this spell's duration, your weapon flares with bright light, and the attack deals an extra 3d8 radiant damage to the target. Additionally, the target must succeed on a Constitution saving throw or be blinded until the spell ends. A creature blinded by this spell makes another Constitution saving throw at the end of each of its turns. On a successful save, it is no longer blinded.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // PHB'14 p. 230. Not in dnd5eapi/open5e's dataset. Cross-checked
  // word-for-word against a second source (dnd5e.wikidot.com/spell:
  // crusaders-mantle), which corroborates 5e-spellbook.app's 2014-edition
  // text exactly. A per-hit rider on every non-hostile creature's future
  // attacks for the duration (same shape as Divine Favor above), no
  // effectKind/attackType; documented as a conditional/multi-effect
  // exception.
  {
    name: "Crusader's Mantle",
    level: 3,
    school: "evocation",
    castingTime: "1 action",
    range: "Self (30-foot radius)",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "Holy power radiates from you in an aura with a 30-foot radius, awakening boldness in friendly creatures. Until the spell ends, the aura moves with you, centered on you. While in the aura, each nonhostile creature in the aura (including you) deals an extra 1d4 radiant damage when it hits with a weapon attack.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // PHB'14 p. 237. Not in dnd5eapi/open5e's dataset. Cross-checked
  // word-for-word against a second source (dnd5e.wikidot.com/spell:
  // elemental-weapon), which corroborates 5e-spellbook.app's 2014-edition
  // text exactly, including the +2/2d4 (5th-6th slot) and +3/3d4 (7th+ slot)
  // upcast tiers. dnd5e.wikidot.com tags Druid and Ranger access
  // "(Optional)" and lists Artificer (a class that didn't exist in 2014) —
  // core 2014 access is Paladin-only. A weapon-enchantment buff, not a
  // direct damage roll — no effectKind, same shape as Magic Weapon
  // (wizard.ts); documented as a conditional/multi-effect exception (the
  // "extra 1d4 damage" phrase would otherwise trip the prose-vs-field
  // audit's damage-phrase check).
  {
    name: "Elemental Weapon",
    level: 3,
    school: "transmutation",
    castingTime: "1 action",
    range: "Touch",
    duration: "Up to 1 hour",
    concentration: true,
    description:
      "A nonmagical weapon you touch becomes a magic weapon. Choose one of the following damage types: acid, cold, fire, lightning, or thunder. For the duration, the weapon has a +1 bonus to attack rolls and deals an extra 1d4 damage of the chosen type when it hits. At Higher Levels. When you cast this spell using a spell slot of 5th or 6th level, the bonus to attack rolls increases to +2 and the extra damage increases to 2d4. When you use a spell slot of 7th level or higher, the bonus increases to +3 and the extra damage increases to 3d4.",
    classes: ["paladin"],
    components: { verbal: true, somatic: true, material: false },
  },
  // ── Level 4 ────────────────────────────────────────────────────────────
  // PHB'14 p. 216. Not in dnd5eapi/open5e's dataset. Cross-checked
  // word-for-word against a second source (dnd5e.wikidot.com/spell:aura-of-
  // purity), which corroborates 5e-spellbook.app's 2014-edition text
  // exactly. dnd5e.wikidot.com tags this spell's Cleric access "(Optional)"
  // — a Tasha's Cauldron of Everything addition, not 2014 core — so core
  // 2014 access is Paladin-only. A pure defensive utility aura (no dice, no
  // save the caster's target makes) — no effectKind/attackType; documented
  // as a conditional/multi-effect exception (the aura grants OTHER
  // creatures advantage on THEIR OWN future saving throws — the prose-vs-
  // field audit's "saving throw" check would otherwise misflag this as a
  // missing attackType:"save").
  {
    name: "Aura of Purity",
    level: 4,
    school: "abjuration",
    castingTime: "1 action",
    range: "Self (30-foot radius)",
    duration: "Up to 10 minutes",
    concentration: true,
    description:
      "Purifying energy radiates from you in an aura with a 30-foot radius. Until the spell ends, the aura moves with you, centered on you. Each nonhostile creature in the aura (including you) can't become diseased, has resistance to poison damage, and has advantage on saving throws against effects that cause any of the following conditions: blinded, charmed, deafened, frightened, paralyzed, poisoned, and stunned.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // PHB'14 p. 278. Not in dnd5eapi/open5e's dataset. Cross-checked
  // word-for-word against a second source (dnd5e.wikidot.com/spell:
  // staggering-smite), which corroborates 5e-spellbook.app's 2014-edition
  // text exactly; neither source carries an "At Higher Levels" clause.
  // Damage is unconditional; the Wisdom save only gates the separate
  // disadvantage/no-reactions rider — multi-effect shape, no effectKind/
  // attackType; documented as a conditional/multi-effect exception.
  {
    name: "Staggering Smite",
    level: 4,
    school: "evocation",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "The next time you hit a creature with a melee weapon attack during this spell's duration, your weapon pierces both body and mind, and the attack deals an extra 4d6 psychic damage to the target. The target must make a Wisdom saving throw. On a failed save, it has disadvantage on attack rolls and ability checks, and can't take reactions, until the end of its next turn.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // ── Level 5 ────────────────────────────────────────────────────────────
  // PHB'14 p. 218. Not in dnd5eapi/open5e's dataset. Cross-checked
  // word-for-word against a second source (dnd5e.wikidot.com/spell:
  // banishing-smite), which corroborates 5e-spellbook.app's 2014-edition
  // text exactly (the wikidot copy has an "of fewer" typo for "or fewer" —
  // this row uses the grammatically-correct "or fewer" both sources
  // otherwise agree on). Damage is unconditional; the banish is conditional
  // on a raw HP threshold, not a saving throw at all — no effectKind/
  // attackType; documented as a conditional/multi-effect exception (the
  // "extra 5d10 force damage" phrase would otherwise trip the prose-vs-
  // field audit's damage-phrase check).
  {
    name: "Banishing Smite",
    level: 5,
    school: "abjuration",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "The next time you hit a creature with a weapon attack before this spell ends, your weapon crackles with force, and the attack deals an extra 5d10 force damage to the target. Additionally, if this attack reduces the target to 50 hit points or fewer, you banish it. If the target is native to a different plane of existence than the one you're on, the target disappears, returning to its home plane. If the target is native to the plane you're on, the creature vanishes into a harmless demiplane. While there, the target is incapacitated. It remains there until the spell ends, at which point the target reappears in the space it left or in the nearest unoccupied space if that space is occupied.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // PHB'14 p. 221. Not in dnd5eapi/open5e's dataset. Cross-checked
  // word-for-word against a second source (dnd5e.wikidot.com/spell:circle-
  // of-power), which corroborates 5e-spellbook.app's 2014-edition text
  // exactly (the wikidot copy has a "saving throws" plural typo at the very
  // end for "saving throw" — this row uses the grammatically-correct
  // singular both sources otherwise agree on). A pure defensive utility
  // aura — no effectKind/attackType; documented as a conditional/multi-
  // effect exception (grants OTHERS advantage on THEIR OWN future saves,
  // same reasoning as Aura of Purity above).
  {
    name: "Circle of Power",
    level: 5,
    school: "abjuration",
    castingTime: "1 action",
    range: "Self (30-foot radius)",
    duration: "Up to 10 minutes",
    concentration: true,
    description:
      "Divine energy radiates from you, distorting and diffusing magical energy within 30 feet of you. Until the spell ends, the sphere moves with you, centered on you. For the duration, each friendly creature in the area (including you) has advantage on saving throws against spells and other magical effects. Additionally, when an affected creature succeeds on a saving throw made against a spell or magical effect that allows it to make a saving throw to take only half damage, it instead takes no damage if it succeeds on the saving throw.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // PHB'14 p. 231. Not in dnd5eapi/open5e's dataset. Cross-checked
  // word-for-word against a second source (dnd5e.wikidot.com/spell:
  // destructive-wave), which corroborates 5e-spellbook.app's 2014-edition
  // text exactly; neither source carries an "At Higher Levels" clause.
  // Genuinely TWO damage components on ONE Constitution save (5d6 thunder
  // AND 5d6 radiant-or-necrotic, caster's choice) plus a knock-prone rider —
  // no single effectKind/damageType captures both, the same "two damage
  // types, no single instance" shape as Hunger of Hadar (warlock.ts);
  // documented as a conditional/multi-effect exception in this slice's data
  // test.
  {
    name: "Destructive Wave",
    level: 5,
    school: "evocation",
    castingTime: "1 action",
    range: "Self (30-foot radius)",
    duration: "Instantaneous",
    description:
      "You strike the ground, creating a burst of divine energy that ripples outward from you. Each creature you choose within 30 feet of you must succeed on a Constitution saving throw or take 5d6 thunder damage, as well as 5d6 radiant or necrotic damage (your choice), and be knocked prone. A creature that succeeds on its saving throw takes half as much damage and isn't knocked prone.",
    classes: ["paladin"],
    components: { verbal: true, somatic: false, material: false },
  },
  // ── Level 6 — none (Paladin caps at 5th-level spells, half-caster) ──
  // ── Level 7 — none (Paladin caps at 5th-level spells, half-caster) ──
  // ── Level 8 — none (Paladin caps at 5th-level spells, half-caster) ──
  // ── Level 9 — none (Paladin caps at 5th-level spells, half-caster) ──
];
