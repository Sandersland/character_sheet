// PHB'14 (2014) Druid spell list — content slice of epic #1517 (#1716).
// Per the epic's row-ownership rule (tie-break Wizard > Cleric > Druid > Bard >
// Sorcerer > Warlock > Paladin > Ranger), Druid is 3rd priority, so this file
// authors every spell on 1-2 class lists where Druid is the highest-priority
// class present (i.e. neither Wizard nor Cleric is on that spell's list). A
// spell on 3+ lists is authored in shared.ts (#1713) instead; this file never
// re-transcribes one, only relies on shared.ts already fanning "druid" into
// its classes[] (verified at the time: every one of the 64 3+-list PHB'14
// Druid spells already carried a druid membership row in shared.ts — no
// gaps found, no membership edits needed there for this slice. #1742's own
// non-SRD-3+-list audit later found one more — Feign Death, a
// Bard/Cleric/Druid/Wizard 4-list spell missing from every slice entirely —
// and added it to shared.ts with a druid tag, bumping this count from 64 to
// 65).
// Wizard-owned 2-list spells Druid also gets (Flaming Sphere, Conjure Minor
// Elementals, Conjure Elemental, Antipathy/Sympathy, Shapechange) are already
// tagged with druid membership in wizard.ts (#1714) — not re-authored here.
// Cleric-owned 2-list spells Druid also gets (Guidance, Resistance, Create or
// Destroy Water, Contagion, Heal, Heroes' Feast, True Resurrection) are
// likewise already tagged with druid membership in cleric.ts (#1715) — not
// re-authored here either. All 12 of those wizard/cleric-owned rows were
// individually verified to already carry "druid" in classes[]; zero edits to
// either file were needed for this slice.
//
// Source: dnd5eapi.co's 2014 spell set (/api/2014/classes/druid/spells,
// which enumerates exactly 106 spells — 7 cantrips, 16 L1, 17 L2, 12 L3,
// 16 L4, 14 L5, 9 L6, 5 L7, 6 L8, 4 L9). Cross-checked against a second
// source (open5e's srd-2014 document, same 319-spell total the Wizard/Cleric
// slices' own headers cite) and against each spell's own
// /api/2014/spells/<slug> "classes" field for every ambiguous case. One
// third-party list (5thsrd.org) disagreed on Meld into Stone — its own
// dnd5eapi record tags "classes": [Cleric] only, with a "land" SUBCLASS tag
// (Circle of the Land's bonus-spell list, not the base Druid class list)
// explaining the third-party page's conflation; Meld into Stone is NOT
// authored or membership-tagged here. Of the 106, 30 are Druid-owned
// (authored below), 7 are Cleric-owned, 5 are Wizard-owned, and 64 are
// shared — all cross-checked as described above.
//
// ADDENDUM (#1721, the Ranger slice): dnd5eapi's SRD-only dataset above
// misses two more real PHB'14 Druid+Ranger 2-list spells entirely — Beast
// Sense (L2) and Grasping Vine (L4) — found by #1721's authoritative-lookup
// sweep (5etools' generated spell-source lookup) and added below per the
// tie-break (Druid outranks Ranger), each cited PHB'14 p.NN individually and
// cross-checked word-for-word against a second source (see their own
// per-row comments). This file now owns 32 rows total (30 SRD + these 2
// hand-transcribed), 109 total PHB'14 Druid spells (108 as of #1721, bumped
// to 109 by #1742's Feign Death addition to shared.ts above).
//
// Every OTHER owned row below (the original 30) is verbatim SRD 5.1 text via
// dnd5eapi, cited SRD 5.1 as a whole rather than per-row (this file's own
// convention, matching cleric.ts/wizard.ts/shared.ts).
// Structured effect fields (effectKind/dice/save/saveEffect/upcast) are
// derived from that same API response's damage/dc JSON, then individually
// audited against each row's own prose (dnd5eapi's dc/damage fields have
// documented gaps — found on 9 rows in the Wizard slice, 2 in Cleric).
//
// This slice's own prose-vs-field audit found ONE such gap: Call Lightning's
// dc field is null despite "Each creature ... must make a dexterity saving
// throw. A creature takes 3d10 lightning damage on a failed save, or half as
// much damage on a successful one" — hand-added attackType/saveAbility/
// saveEffect from the row's own prose, same as the other slices' fixes.
//
// Scraping artifacts cleaned: dnd5eapi's "the GM" restored to this repo's
// "the DM" (Conjure Animals, Conjure Woodland Beings, Divination x2, Giant
// Insect x2, Awaken, Reincarnate x2, Conjure Fey — 10 occurrences across 7
// rows); Druidcraft's stray literal quote marks around "range" removed
// ("within 'range':" -> "within range:"); Druidcraft's "faint order of
// skunk" corrected to the actual SRD text "faint odor of skunk" (verified
// against a second source, 5esrd.com); Entangle's "starting form a point"
// typo corrected to "starting from a point"; Conjure Animals' higher-level
// clause restored a dropped trailing word ("three times as many with a
// 7th-level" -> "...7th-level slot", matching Conjure Woodland Beings' own
// complete phrasing for the identical mechanic one level up); Moonbeam's
// "1dl0" OCR artifact corrected to "1d10"; Storm of Vengeance's markdown
// "***Round N.***" sub-headings stripped of their asterisks
// (SpellDetailCard has no markdown parser, matching Command's Approach/
// Drop/Flee precedent in cleric.ts); Reincarnate's d100 race table
// hand-converted from a literal markdown pipe table to prose, values
// unchanged. "Pass without Trace" and "Commune with Nature" use this repo's
// established lowercase-preposition title casing (dnd5eapi title-cases every
// word) — matching "Pass without Trace"'s existing spelling everywhere else
// in this codebase (spells.ts, subclass-granted-spells.ts, shadow-arts.ts).
//
// Structured-field calls worth flagging for the rules-accuracy pass:
// - Heat Metal: the 2d8 fire damage triggers unconditionally when the object
//   is touched (no attack roll, no save — matches Forbiddance's
//   "unconditional hit" shape in cleric.ts); the constitution save only
//   gates a SEPARATE consequence (dropping the object), not the damage
//   itself, so attackType/saveAbility are left unset despite the save
//   appearing in the prose — same "recurring save gates a side-effect, not
//   the initial hit" shape as Contagion's melee-spell-attack precedent.
// - Flame Blade: PHB'14's real upcast rate is "+1d6 for every TWO slot
//   levels above 2nd" — upcastDicePerLevel is a per-1-level-only field, so
//   it's left unset (same Spiritual Weapon precedent from cleric.ts); the
//   description's own text is the only carrier of the actual rate.
// - Barkskin: PHB'14's real mechanic is a 16 AC floor, REQUIRES
//   concentration, and costs a full action to cast (dnd5eapi: concentration
//   true, casting_time "1 action", "...can't be less than 16") — three
//   separate, genuine differences from the 2024 SPELLS row (floor 17,
//   non-concentration, "1 bonus action" — see that row's own comment).
//   Reusing any of the 2024 row's values here would silently bleed the 2024
//   revision into a 2014 row, the exact edition-mixing bug a prior slice's
//   Chromatic Orb draft committed.
// - Wall of Thorns: TWO separate damage instances (7d8 piercing when the
//   wall appears, 7d8 slashing per turn spent moving through it) — no single
//   effectKind/damageType captures both, matches Flame Strike/Ice Storm's
//   multi-type precedent (utility row, numbers carried only in prose).
// - Storm of Vengeance: five distinct rounds, each with its own save type
//   (constitution round 1, dexterity round 3) and damage type (thunder,
//   acid, lightning, bludgeoning, cold) — far past what one
//   effectKind/dice/save triple can express, matches Meteor Swarm's "too
//   complex, utility row" precedent even more strongly than Flame Strike's
//   two-damage-type case.
// - Goodberry: 1 hp per berry (up to 10) is a per-item flat amount, not a
//   single dice/flat heal at cast time — utility row, matching Aid's
//   "inexpressible as a dice heal" precedent shape (for a different
//   structural reason here: per-consumed-item, not per-slot-level).
import type { CatalogSpell } from "../spells.js";

export const DRUID_SPELLS_2014: CatalogSpell[] = [
  // ── Cantrips ──────────────────────────────────────────────────────────────
  {
    name: "Druidcraft",
    level: 0,
    school: "transmutation",
    castingTime: "1 action",
    range: "30 feet",
    duration: "Instantaneous",
    description: "Whispering to the spirits of nature, you create one of the following effects within range: - You create a tiny, harmless sensory effect that predicts what the weather will be at your location for the next 24 hours. The effect might manifest as a golden orb for clear skies, a cloud for rain, falling snowflakes for snow, and so on. This effect persists for 1 round. - You instantly make a flower bloom, a seed pod open, or a leaf bud bloom. - You create an instantaneous, harmless sensory effect, such as falling leaves, a puff of wind, the sound of a small animal, or the faint odor of skunk. The effect must fit in a 5-foot cube. - You instantly light or snuff out a candle, a torch, or a small campfire.",
    classes: ["druid"],
    components: { verbal: true, somatic: true, material: false },
  },
  {
    name: "Produce Flame",
    level: 0,
    school: "conjuration",
    castingTime: "1 action",
    range: "Self",
    duration: "10 minutes",
    description: "A flickering flame appears in your hand. The flame remains there for the duration and harms neither you nor your equipment. The flame sheds bright light in a 10-foot radius and dim light for an additional 10 feet. The spell ends if you dismiss it as an action or if you cast it again. You can also attack with the flame, although doing so ends the spell. When you cast this spell, or as an action on a later turn, you can hurl the flame at a creature within 30 feet of you. Make a ranged spell attack. On a hit, the target takes 1d8 fire damage. This spell's damage increases by 1d8 when you reach 5th level (2d8), 11th level (3d8), and 17th level (4d8).",
    classes: ["druid"],
    components: { verbal: true, somatic: true, material: false },
    attackType: "attack",
    effectKind: "damage",
    effectDiceCount: 1,
    effectDiceFaces: 8,
    damageType: "fire",
    cantripScaling: true,
  },
  {
    name: "Shillelagh",
    level: 0,
    school: "transmutation",
    castingTime: "1 bonus action",
    range: "Touch",
    duration: "1 minute",
    description: "The wood of a club or a quarterstaff you are holding is imbued with nature's power. For the duration, you can use your spellcasting ability instead of Strength for the attack and damage rolls of melee attacks using that weapon, and the weapon's damage die becomes a d8. The weapon also becomes magical, if it isn't already. The spell ends if you cast it again or if you let go of the weapon.",
    classes: ["druid"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "mistletoe, a shamrock leaf, and a club or quarterstaff" },
    // A weapon-die/attack-ability swap, not an AC buff — doesn't fit the
    // ac/acFloor/acUnarmoredBase buff channel, matches Warding Bond's
    // "too complex for the generic channel" precedent from cleric.ts.
  },
  // ── Level 1 ───────────────────────────────────────────────────────────────
  {
    name: "Entangle",
    level: 1,
    school: "conjuration",
    castingTime: "1 action",
    range: "90 feet",
    duration: "Up to 1 minute",
    concentration: true,
    description: "Grasping weeds and vines sprout from the ground in a 20-foot square starting from a point within range. For the duration, these plants turn the ground in the area into difficult terrain. A creature in the area when you cast the spell must succeed on a strength saving throw or be restrained by the entangling plants until the spell ends. A creature restrained by the plants can use its action to make a Strength check against your spell save DC. On a success, it frees itself. When the spell ends, the conjured plants wilt away.",
    classes: ["druid"],
    components: { verbal: true, somatic: true, material: false },
    attackType: "save",
    saveAbility: "strength",
  },
  {
    name: "Faerie Fire",
    level: 1,
    school: "evocation",
    castingTime: "1 action",
    range: "60 feet",
    duration: "Up to 1 minute",
    concentration: true,
    description: "Each object in a 20-foot cube within range is outlined in blue, green, or violet light (your choice). Any creature in the area when the spell is cast is also outlined in light if it fails a dexterity saving throw. For the duration, objects and affected creatures shed dim light in a 10-foot radius. Any attack roll against an affected creature or object has advantage if the attacker can see it, and the affected creature or object can't benefit from being invisible.",
    classes: ["druid"],
    components: { verbal: true, somatic: false, material: false },
    attackType: "save",
    saveAbility: "dexterity",
  },
  {
    name: "Goodberry",
    level: 1,
    school: "transmutation",
    castingTime: "1 action",
    range: "Touch",
    duration: "Instantaneous",
    description: "Up to ten berries appear in your hand and are infused with magic for the duration. A creature can use its action to eat one berry. Eating a berry restores 1 hit point, and the berry provides enough nourishment to sustain a creature for a day. The berries lose their potency if they have not been consumed within 24 hours of the casting of this spell.",
    classes: ["druid", "ranger"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "a sprig of mistletoe" },
    // 1 hp per berry (up to 10, eaten one at a time over the duration) is a
    // per-item flat amount, not a single dice/flat heal at cast time —
    // utility row, matching Aid's "inexpressible as a dice heal" precedent.
  },
  // ── Level 2 ───────────────────────────────────────────────────────────────
  {
    name: "Barkskin",
    level: 2,
    school: "transmutation",
    castingTime: "1 action",
    range: "Touch",
    duration: "Up to 1 hour",
    concentration: true,
    description: "You touch a willing creature. Until the spell ends, the target's skin has a rough, bark-like appearance, and the target's AC can't be less than 16, regardless of what kind of armor it is wearing.",
    classes: ["druid", "ranger"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "a handful of oak bark" },
    // PHB'14: floor 16, concentration required, "1 action" to cast — the
    // 2024 SPELLS row (floor 17, non-concentration, "1 bonus action") is a
    // genuine three-part edition revision, not reused here (see this file's
    // header).
    effectKind: "buff",
    buffTarget: "acFloor",
    buffModifier: 16,
  },
  // PHB'14 p. 217. Not in dnd5eapi/open5e's SRD dataset. Found by #1721's
  // (Ranger slice) authoritative-lookup sweep (5etools' generated
  // spell-source lookup) — a genuine gap in this file's own SRD-only sweep,
  // since Beast Sense isn't SRD content either. Cross-checked word-for-word
  // against a second source (dnd5e.wikidot.com/spell:beast-sense), which
  // corroborates 5etools' own PHB-sourced text exactly, including the
  // ritual tag. Druid AND Ranger both carry base PHB'14 class access (no
  // "(Optional)" tag on either in the lookup) — added here per the
  // tie-break (Druid outranks Ranger), with a ranger membership tag.
  {
    name: "Beast Sense",
    level: 2,
    school: "divination",
    castingTime: "1 action",
    range: "Touch",
    duration: "Up to 1 hour",
    concentration: true,
    ritual: true,
    description:
      "You touch a willing beast. For the duration of the spell, you can use your action to see through the beast's eyes and hear what it hears, and continue to do so until you use your action to return to your normal senses. While perceiving through the beast's senses, you gain the benefits of any special senses possessed by that creature, though you are blinded and deafened to your own surroundings.",
    classes: ["druid", "ranger"],
    components: { verbal: false, somatic: true, material: false },
  },
  {
    name: "Flame Blade",
    level: 2,
    school: "evocation",
    castingTime: "1 bonus action",
    range: "Self",
    duration: "Up to 10 minutes",
    concentration: true,
    description: "You evoke a fiery blade in your free hand. The blade is similar in size and shape to a scimitar, and it lasts for the duration. If you let go of the blade, it disappears, but you can evoke the blade again as a bonus action. You can use your action to make a melee spell attack with the fiery blade. On a hit, the target takes 3d6 fire damage. The flaming blade sheds bright light in a 10-foot radius and dim light for an additional 10 feet. At Higher Levels. When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for every two slot levels above 2nd.",
    classes: ["druid"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "leaf of sumac" },
    attackType: "attack",
    effectKind: "damage",
    effectDiceCount: 3,
    effectDiceFaces: 6,
    damageType: "fire",
    // upcastDicePerLevel deliberately UNSET: PHB'14's real rate is "+1d6 for
    // EVERY TWO slot levels above 2nd," not per-level — see this file's
    // header (Spiritual Weapon precedent, cleric.ts). The description's own
    // text is the only carrier of this row's actual upcast rule.
  },
  {
    name: "Heat Metal",
    level: 2,
    school: "transmutation",
    castingTime: "1 action",
    range: "60 feet",
    duration: "Up to 1 minute",
    concentration: true,
    description: "Choose a manufactured metal object, such as a metal weapon or a suit of heavy or medium metal armor, that you can see within range. You cause the object to glow red-hot. Any creature in physical contact with the object takes 2d8 fire damage when you cast the spell. Until the spell ends, you can use a bonus action on each of your subsequent turns to cause this damage again. If a creature is holding or wearing the object and takes the damage from it, the creature must succeed on a constitution saving throw or drop the object if it can. If it doesn't drop the object, it has disadvantage on attack rolls and ability checks until the start of your next turn. At Higher Levels. When you cast this spell using a spell slot of 3rd level or higher, the damage increases by 1d8 for each slot level above 2nd.",
    classes: ["druid", "bard"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "a piece of iron and a flame" },
    // Damage is unconditional (no attack roll, no save gates it — see this
    // file's header); attackType/saveAbility deliberately unset despite the
    // constitution save appearing in the prose, since that save only decides
    // whether the object is dropped, a separate consequence.
    effectKind: "damage",
    effectDiceCount: 2,
    effectDiceFaces: 8,
    damageType: "fire",
    upcastDicePerLevel: 1,
  },
  {
    name: "Moonbeam",
    level: 2,
    school: "evocation",
    castingTime: "1 action",
    range: "120 feet",
    duration: "Up to 1 minute",
    concentration: true,
    description: "A silvery beam of pale light shines down in a 5-foot radius, 40-foot-high cylinder centered on a point within range. Until the spell ends, dim light fills the cylinder. When a creature enters the spell's area for the first time on a turn or starts its turn there, it is engulfed in ghostly flames that cause searing pain, and it must make a constitution saving throw. It takes 2d10 radiant damage on a failed save, or half as much damage on a successful one. A shapechanger makes its saving throw with disadvantage. If it fails, it also instantly reverts to its original form and can't assume a different form until it leaves the spell's light. On each of your turns after you cast this spell, you can use an action to move the beam 60 feet in any direction. At Higher Levels. When you cast this spell using a spell slot of 3rd level or higher, the damage increases by 1d10 for each slot level above 2nd.",
    classes: ["druid"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "several seeds of any moonseed plant and a piece of opalescent feldspar" },
    attackType: "save",
    saveAbility: "constitution",
    saveEffect: "half",
    effectKind: "damage",
    effectDiceCount: 2,
    effectDiceFaces: 10,
    damageType: "radiant",
    upcastDicePerLevel: 1,
  },
  {
    name: "Pass without Trace",
    level: 2,
    school: "abjuration",
    castingTime: "1 action",
    range: "Self",
    duration: "Up to 1 hour",
    concentration: true,
    description: "A veil of shadows and silence radiates from you, masking you and your companions from detection. For the duration, each creature you choose within 30 feet of you (including you) has a +10 bonus to Dexterity (Stealth) checks and can't be tracked except by magical means. A creature that receives this bonus leaves behind no tracks or other traces of its passage.",
    classes: ["druid", "ranger"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "ashes from a burned leaf of mistletoe and a sprig of spruce" },
    // A +10 Stealth-check bonus, not an AC buff — doesn't fit the buff
    // channel (ac/acFloor/acUnarmoredBase only), utility row.
  },
  {
    name: "Spike Growth",
    level: 2,
    school: "transmutation",
    castingTime: "1 action",
    range: "150 feet",
    duration: "Up to 10 minutes",
    concentration: true,
    description: "The ground in a 20-foot radius centered on a point within range twists and sprouts hard spikes and thorns. The area becomes difficult terrain for the duration. When a creature moves into or within the area, it takes 2d4 piercing damage for every 5 feet it travels. The transformation of the ground is camouflaged to look natural. Any creature that can't see the area at the time the spell is cast can make a Wisdom (Perception) check against your spell save DC to recognize the terrain as hazardous before entering it.",
    classes: ["druid", "ranger"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "seven sharp thorns or seven small twigs, each sharpened to a point" },
    // Damage scales with distance MOVED (2d4 per 5 feet), not a single
    // fixed-dice hit gated by an attack or save — no attackType/effectKind
    // combination expresses a per-5-feet-traveled hazard, utility row.
  },
  // ── Level 3 ───────────────────────────────────────────────────────────────
  {
    name: "Call Lightning",
    level: 3,
    school: "conjuration",
    castingTime: "1 action",
    range: "120 feet",
    duration: "Up to 10 minutes",
    concentration: true,
    description: "A storm cloud appears in the shape of a cylinder that is 10 feet tall with a 60-foot radius, centered on a point you can see 100 feet directly above you. The spell fails if you can't see a point in the air where the storm cloud could appear (for example, if you are in a room that can't accommodate the cloud). When you cast the spell, choose a point you can see within range. A bolt of lightning flashes down from the cloud to that point. Each creature within 5 feet of that point must make a dexterity saving throw. A creature takes 3d10 lightning damage on a failed save, or half as much damage on a successful one. On each of your turns until the spell ends, you can use your action to call down lightning in this way again, targeting the same point or a different one. If you are outdoors in stormy conditions when you cast this spell, the spell gives you control over the existing storm instead of creating a new one. Under such conditions, the spell's damage increases by 1d10. At Higher Levels. When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d10 for each slot level above 3rd.",
    classes: ["druid"],
    components: { verbal: true, somatic: true, material: false },
    // dnd5eapi's own dc field is null despite the prose clearly gating on a
    // dexterity save with half damage on success — same API-gap class as
    // Flaming Sphere/Scorching Ray (#1714) and Sanctuary/Spirit Guardians
    // (#1715). Hand-added from this row's own text, not a separate guess.
    attackType: "save",
    saveAbility: "dexterity",
    saveEffect: "half",
    effectKind: "damage",
    effectDiceCount: 3,
    effectDiceFaces: 10,
    damageType: "lightning",
    upcastDicePerLevel: 1,
  },
  {
    name: "Conjure Animals",
    level: 3,
    school: "conjuration",
    castingTime: "1 action",
    range: "60 feet",
    duration: "Up to 1 hour",
    concentration: true,
    description: "You summon fey spirits that take the form of beasts and appear in unoccupied spaces that you can see within range. Choose one of the following options for what appears: - One beast of challenge rating 2 or lower - Two beasts of challenge rating 1 or lower - Four beasts of challenge rating 1/2 or lower - Eight beasts of challenge rating 1/4 or lower. Each beast is also considered fey, and it disappears when it drops to 0 hit points or when the spell ends. The summoned creatures are friendly to you and your companions. Roll initiative for the summoned creatures as a group, which has its own turns. They obey any verbal commands that you issue to them (no action required by you). If you don't issue any commands to them, they defend themselves from hostile creatures, but otherwise take no actions. The DM has the creatures' statistics. At Higher Levels. When you cast this spell using certain higher-level spell slots, you choose one of the summoning options above, and more creatures appear: twice as many with a 5th-level slot, three times as many with a 7th-level slot.",
    classes: ["druid", "ranger"],
    components: { verbal: true, somatic: true, material: false },
    // Summon spell — no single attack/save/damage/heal fits (matches Conjure
    // Woodland Beings/Conjure Fey/Planar Ally's precedent), utility row.
  },
  {
    name: "Wind Wall",
    level: 3,
    school: "evocation",
    castingTime: "1 action",
    range: "120 feet",
    duration: "Up to 1 minute",
    concentration: true,
    description: "A wall of strong wind rises from the ground at a point you choose within range. You can make the wall up to 50 feet long, 15 feet high, and 1 foot thick. You can shape the wall in any way you choose so long as it makes one continuous path along the ground. The wall lasts for the duration. When the wall appears, each creature within its area must make a strength saving throw. A creature takes 3d8 bludgeoning damage on a failed save, or half as much damage on a successful one. The strong wind keeps fog, smoke, and other gases at bay. Small or smaller flying creatures or objects can't pass through the wall. Loose, lightweight materials brought into the wall fly upward. Arrows, bolts, and other ordinary projectiles launched at targets behind the wall are deflected upward and automatically miss. (Boulders hurled by giants or siege engines, and similar projectiles, are unaffected.) Creatures in gaseous form can't pass through it.",
    classes: ["druid", "ranger"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "a tiny fan and a feather of exotic origin" },
    attackType: "save",
    saveAbility: "strength",
    saveEffect: "half",
    effectKind: "damage",
    effectDiceCount: 3,
    effectDiceFaces: 8,
    damageType: "bludgeoning",
    // No "At Higher Levels" text in PHB'14 — this spell doesn't upcast,
    // upcastDicePerLevel deliberately absent.
  },
  // ── Level 4 ───────────────────────────────────────────────────────────────
  {
    name: "Conjure Woodland Beings",
    level: 4,
    school: "conjuration",
    castingTime: "1 action",
    range: "60 feet",
    duration: "Up to 1 hour",
    concentration: true,
    description: "You summon fey creatures that appear in unoccupied spaces that you can see within range. Choose one of the following options for what appears: - One fey creature of challenge rating 2 or lower - Two fey creatures of challenge rating 1 or lower - Four fey creatures of challenge rating 1/2 or lower - Eight fey creatures of challenge rating 1/4 or lower. A summoned creature disappears when it drops to 0 hit points or when the spell ends. The summoned creatures are friendly to you and your companions. Roll initiative for the summoned creatures as a group, which have their own turns. They obey any verbal commands that you issue to them (no action required by you). If you don't issue any commands to them, they defend themselves from hostile creatures, but otherwise take no actions. The DM has the creatures' statistics. At Higher Levels. When you cast this spell using certain higher-level spell slots, you choose one of the summoning options above, and more creatures appear: twice as many with a 6th-level slot and three times as many with an 8th-level slot.",
    classes: ["druid", "ranger"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "one holly berry per creature summoned" },
    // Summon spell, utility row — see Conjure Animals.
  },
  {
    name: "Divination",
    level: 4,
    school: "divination",
    castingTime: "1 action",
    range: "Self",
    duration: "Instantaneous",
    ritual: true,
    description: "Your magic and an offering put you in contact with a god or a god's servants. You ask a single question concerning a specific goal, event, or activity to occur within 7 days. The DM offers a truthful reply. The reply might be a short phrase, a cryptic rhyme, or an omen. The spell doesn't take into account any possible circumstances that might change the outcome, such as the casting of additional spells or the loss or gain of a companion. If you cast the spell two or more times before finishing your next long rest, there is a cumulative 25 percent chance for each casting after the first that you get a random reading. The DM makes this roll in secret.",
    classes: ["druid"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "incense and a sacrificial offering appropriate to your religion, together worth at least 25gp, which the spell consumes" },
  },
  {
    name: "Dominate Beast",
    level: 4,
    school: "enchantment",
    castingTime: "1 action",
    range: "60 feet",
    duration: "Up to 1 minute",
    concentration: true,
    description: "You attempt to beguile a creature that you can see within range. It must succeed on a wisdom saving throw or be charmed by you for the duration. If you or creatures that are friendly to you are fighting it, it has advantage on the saving throw. While the creature is charmed, you have a telepathic link with it as long as the two of you are on the same plane of existence. You can use this telepathic link to issue commands to the creature while you are conscious (no action required), which it does its best to obey. You can specify a simple and general course of action, such as \"Attack that creature,\" \"Run over there,\" or \"Fetch that object.\" If the creature completes the order and doesn't receive further direction from you, it defends and preserves itself to the best of its ability. You can use your action to take total and precise control of the target. Until the end of your next turn, the creature takes only the actions you choose, and doesn't do anything that you don't allow it to do. During this time, you can also cause the creature to use a reaction, but this requires you to use your own reaction as well. Each time the target takes damage, it makes a new wisdom saving throw against the spell. If the saving throw succeeds, the spell ends. At Higher Levels. When you cast this spell with a 9th level spell slot, the duration is concentration, up to 8 hours.",
    classes: ["druid", "sorcerer"],
    components: { verbal: true, somatic: true, material: false },
    attackType: "save",
    saveAbility: "wisdom",
  },
  {
    name: "Giant Insect",
    level: 4,
    school: "transmutation",
    castingTime: "1 action",
    range: "30 feet",
    duration: "Up to 10 minutes",
    concentration: true,
    description: "You transform up to ten centipedes, three spiders, five wasps, or one scorpion within range into giant versions of their natural forms for the duration. A centipede becomes a giant centipede, a spider becomes a giant spider, a wasp becomes a giant wasp, and a scorpion becomes a giant scorpion. Each creature obeys your verbal commands, and in combat, they act on your turn each round. The DM has the statistics for these creatures and resolves their actions and movement. A creature remains in its giant size for the duration, until it drops to 0 hit points, or until you use an action to dismiss the effect on it. The DM might allow you to choose different targets. For example, if you transform a bee, its giant version might have the same statistics as a giant wasp.",
    classes: ["druid"],
    components: { verbal: true, somatic: true, material: false },
    // Any damage dealt comes from the transformed creatures' own stat
    // blocks, not this spell directly — utility row.
  },
  // PHB'14 p. 246. Not in dnd5eapi/open5e's SRD dataset. Found by #1721's
  // (Ranger slice) authoritative-lookup sweep — the same class of gap as
  // Beast Sense above. Cross-checked word-for-word against a second source
  // (dnd5e.wikidot.com/spell:grasping-vine), which corroborates 5etools' own
  // PHB-sourced text exactly; neither source carries an "At Higher Levels"
  // clause. Druid AND Ranger both carry base PHB'14 class access (no
  // "(Optional)" tag on either) — added here per the tie-break, with a
  // ranger membership tag. Pure pull/control effect (no damage at all) — a
  // clean attackType:"save" row, same shape as Entangle above.
  {
    name: "Grasping Vine",
    level: 4,
    school: "conjuration",
    castingTime: "1 bonus action",
    range: "30 feet",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "You conjure a vine that sprouts from the ground in an unoccupied space of your choice that you can see within range. When you cast this spell, you can direct the vine to lash out at a creature within 30 feet of it that you can see. That creature must succeed on a Dexterity saving throw or be pulled 20 feet directly toward the vine. Until the spell ends, you can direct the vine to lash out at the same creature or another one as a bonus action on each of your turns.",
    classes: ["druid", "ranger"],
    components: { verbal: true, somatic: true, material: false },
    attackType: "save",
    saveAbility: "dexterity",
  },
  // ── Level 5 ───────────────────────────────────────────────────────────────
  {
    name: "Antilife Shell",
    level: 5,
    school: "abjuration",
    castingTime: "1 action",
    range: "Self",
    duration: "Up to 1 hour",
    concentration: true,
    description: "A shimmering barrier extends out from you in a 10-foot radius and moves with you, remaining centered on you and hedging out creatures other than undead and constructs. The barrier lasts for the duration. The barrier prevents an affected creature from passing or reaching through. An affected creature can cast spells or make attacks with ranged or reach weapons through the barrier. If you move so that an affected creature is forced to pass through the barrier, the spell ends.",
    classes: ["druid"],
    components: { verbal: true, somatic: true, material: false },
  },
  {
    name: "Awaken",
    level: 5,
    school: "transmutation",
    castingTime: "8 hours",
    range: "Touch",
    duration: "Instantaneous",
    description: "After spending the casting time tracing magical pathways within a precious gemstone, you touch a Huge or smaller beast or plant. The target must have either no Intelligence score or an Intelligence of 3 or less. The target gains an Intelligence of 10. The target also gains the ability to speak one language you know. If the target is a plant, it gains the ability to move its limbs, roots, vines, creepers, and so forth, and it gains senses similar to a human's. Your DM chooses statistics appropriate for the awakened plant, such as the statistics for the awakened shrub or the awakened tree. The awakened beast or plant is charmed by you for 30 days or until you or your companions do anything harmful to it. When the charmed condition ends, the awakened creature chooses whether to remain friendly to you, based on how you treated it while it was charmed.",
    classes: ["druid", "bard"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "an agate worth at least 1,000 gp, which the spell consumes" },
  },
  {
    name: "Commune with Nature",
    level: 5,
    school: "divination",
    castingTime: "1 minute",
    range: "Self",
    duration: "Instantaneous",
    ritual: true,
    description: "You briefly become one with nature and gain knowledge of the surrounding territory. In the outdoors, the spell gives you knowledge of the land within 3 miles of you. In caves and other natural underground settings, the radius is limited to 300 feet. The spell doesn't function where nature has been replaced by construction, such as in dungeons and towns. You instantly gain knowledge of up to three facts of your choice about any of the following subjects as they relate to the area: - terrain and bodies of water - prevalent plants, minerals, animals, or peoples - powerful celestials, fey, fiends, elementals, or undead - influence from other planes of existence - buildings. For example, you could determine the location of powerful undead in the area, the location of major sources of safe drinking water, and the location of any nearby towns.",
    classes: ["druid", "ranger"],
    components: { verbal: true, somatic: true, material: false },
  },
  {
    name: "Reincarnate",
    level: 5,
    school: "transmutation",
    castingTime: "1 hour",
    range: "Touch",
    duration: "Instantaneous",
    description: "You touch a dead humanoid or a piece of a dead humanoid. Provided that the creature has been dead no longer than 10 days, the spell forms a new adult body for it and then calls the soul to enter that body. If the target's soul isn't free or willing to do so, the spell fails. The magic fashions a new body for the creature to inhabit, which likely causes the creature's race to change. The DM rolls a d100 and consults the following table to determine what form the creature takes when restored to life, or the DM chooses a form: 01-04 Dragonborn, 05-13 Dwarf (hill), 14-21 Dwarf (mountain), 22-25 Elf (dark), 26-34 Elf (high), 35-42 Elf (wood), 43-46 Gnome (forest), 47-52 Gnome (rock), 53-56 Half-elf, 57-60 Half-orc, 61-68 Halfling (lightfoot), 69-76 Halfling (stout), 77-96 Human, 97-00 Tiefling. The reincarnated creature recalls its former life and experiences. It retains the capabilities it had in its original form, except it exchanges its original race for the new one and changes its racial traits accordingly.",
    classes: ["druid"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "rare oils and unguents worth at least 1,000 gp, which the spell consumes" },
  },
  {
    name: "Tree Stride",
    level: 5,
    school: "conjuration",
    castingTime: "1 action",
    range: "Self",
    duration: "Up to 1 minute",
    concentration: true,
    description: "You gain the ability to enter a tree and move from inside it to inside another tree of the same kind within 500 feet. Both trees must be living and at least the same size as you. You must use 5 feet of movement to enter a tree. You instantly know the location of all other trees of the same kind within 500 feet and, as part of the move used to enter the tree, can either pass into one of those trees or step out of the tree you're in. You appear in a spot of your choice within 5 feet of the destination tree, using another 5 feet of movement. If you have no movement left, you appear within 5 feet of the tree you entered. You can use this transportation ability once per round for the duration. You must end each turn outside a tree.",
    classes: ["druid", "ranger"],
    components: { verbal: true, somatic: true, material: false },
  },
  // ── Level 6 ───────────────────────────────────────────────────────────────
  {
    name: "Conjure Fey",
    level: 6,
    school: "conjuration",
    castingTime: "1 minute",
    range: "90 feet",
    duration: "Up to 1 hour",
    concentration: true,
    description: "You summon a fey creature of challenge rating 6 or lower, or a fey spirit that takes the form of a beast of challenge rating 6 or lower. It appears in an unoccupied space that you can see within range. The fey creature disappears when it drops to 0 hit points or when the spell ends. The fey creature is friendly to you and your companions for the duration. Roll initiative for the creature, which has its own turns. It obeys any verbal commands that you issue to it (no action required by you), as long as they don't violate its alignment. If you don't issue any commands to the fey creature, it defends itself from hostile creatures but otherwise takes no actions. If your concentration is broken, the fey creature doesn't disappear. Instead, you lose control of the fey creature, it becomes hostile toward you and your companions, and it might attack. An uncontrolled fey creature can't be dismissed by you, and it disappears 1 hour after you summoned it. The DM has the fey creature's statistics. At Higher Levels. When you cast this spell using a spell slot of 7th level or higher, the challenge rating increases by 1 for each slot level above 6th.",
    classes: ["druid", "warlock"],
    components: { verbal: true, somatic: true, material: false },
    // Summon spell, utility row — see Conjure Animals.
  },
  {
    name: "Transport via Plants",
    level: 6,
    school: "conjuration",
    castingTime: "1 action",
    range: "10 feet",
    duration: "1 round",
    description: "This spell creates a magical link between a Large or larger inanimate plant within range and another plant, at any distance, on the same plane of existence. You must have seen or touched the destination plant at least once before. For the duration, any creature can step into the target plant and exit from the destination plant by using 5 feet of movement.",
    classes: ["druid"],
    components: { verbal: true, somatic: true, material: false },
  },
  {
    name: "Wall of Thorns",
    level: 6,
    school: "conjuration",
    castingTime: "1 action",
    range: "120 feet",
    duration: "Up to 10 minutes",
    concentration: true,
    description: "You create a wall of tough, pliable, tangled brush bristling with needle-sharp thorns. The wall appears within range on a solid surface and lasts for the duration. You choose to make the wall up to 60 feet long, 10 feet high, and 5 feet thick or a circle that has a 20-foot diameter and is up to 20 feet high and 5 feet thick. The wall blocks line of sight. When the wall appears, each creature within its area must make a dexterity saving throw. On a failed save, a creature takes 7d8 piercing damage, or half as much damage on a successful save. A creature can move through the wall, albeit slowly and painfully. For every 1 foot a creature moves through the wall, it must spend 4 feet of movement. Furthermore, the first time a creature enters the wall on a turn or ends its turn there, the creature must make a dexterity saving throw. It takes 7d8 slashing damage on a failed save, or half as much damage on a successful one. At Higher Levels. When you cast this spell using a spell slot of 7th level or higher, both types of damage increase by 1d8 for each slot level above 6th.",
    classes: ["druid"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "a handful of thorns" },
    // TWO separate damage instances (piercing on appearance, slashing while
    // moving through) — see this file's header, matches Flame Strike/Ice
    // Storm's multi-type precedent; utility row, numbers carried only in
    // prose.
  },
  {
    name: "Wind Walk",
    level: 6,
    school: "transmutation",
    castingTime: "1 minute",
    range: "30 feet",
    duration: "8 hours",
    description: "You and up to ten willing creatures you can see within range assume a gaseous form for the duration, appearing as wisps of cloud. While in this cloud form, a creature has a flying speed of 300 feet and has resistance to damage from nonmagical weapons. The only actions a creature can take in this form are the Dash action or to revert to its normal form. Reverting takes 1 minute, during which time a creature is incapacitated and can't move. Until the spell ends, a creature can revert to cloud form, which also requires the 1-minute transformation. If a creature is in cloud form and flying when the effect ends, the creature descends 60 feet per round for 1 minute until it lands, which it does safely. If it can't land after 1 minute, the creature falls the remaining distance.",
    classes: ["druid"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "fire and holy water" },
  },
  // ── Level 8 ───────────────────────────────────────────────────────────────
  {
    name: "Animal Shapes",
    level: 8,
    school: "transmutation",
    castingTime: "1 action",
    range: "30 feet",
    duration: "Up to 24 hours",
    concentration: true,
    description: "Your magic turns others into beasts. Choose any number of willing creatures that you can see within range. You transform each target into the form of a Large or smaller beast with a challenge rating of 4 or lower. On subsequent turns, you can use your action to transform affected creatures into new forms. The transformation lasts for the duration for each target, or until the target drops to 0 hit points or dies. You can choose a different form for each target. A target's game statistics are replaced by the statistics of the chosen beast, though the target retains its alignment and Intelligence, Wisdom, and Charisma scores. The target assumes the hit points of its new form, and when it reverts to its normal form, it returns to the number of hit points it had before it transformed. If it reverts as a result of dropping to 0 hit points, any excess damage carries over to its normal form. As long as the excess damage doesn't reduce the creature's normal form to 0 hit points, it isn't knocked unconscious. The creature is limited in the actions it can perform by the nature of its new form, and it can't speak or cast spells. The target's gear melds into the new form. The target can't activate, wield, or otherwise benefit from any of its equipment.",
    classes: ["druid"],
    components: { verbal: true, somatic: true, material: false },
  },
  // ── Level 9 ───────────────────────────────────────────────────────────────
  {
    name: "Storm of Vengeance",
    level: 9,
    school: "conjuration",
    castingTime: "1 action",
    range: "Sight",
    duration: "Up to 1 minute",
    concentration: true,
    description: "A churning storm cloud forms, centered on a point you can see and spreading to a radius of 360 feet. Lightning flashes in the area, thunder booms, and strong winds roar. Each creature under the cloud (no more than 5,000 feet beneath the cloud) when it appears must make a constitution saving throw. On a failed save, a creature takes 2d6 thunder damage and becomes deafened for 5 minutes. Each round you maintain concentration on this spell, the storm produces additional effects on your turn. Round 2. Acidic rain falls from the cloud. Each creature and object under the cloud takes 1d6 acid damage. Round 3. You call six bolts of lightning from the cloud to strike six creatures or objects of your choice beneath the cloud. A given creature or object can't be struck by more than one bolt. A struck creature must make a dexterity saving throw. The creature takes 10d6 lightning damage on a failed save, or half as much damage on a successful one. Round 4. Hailstones rain down from the cloud. Each creature under the cloud takes 2d6 bludgeoning damage. Round 5-10. Gusts and freezing rain assail the area under the cloud. The area becomes difficult terrain and is heavily obscured. Each creature there takes 1d6 cold damage. Ranged weapon attacks in the area are impossible. The wind and rain count as a severe distraction for the purposes of maintaining concentration on spells. Finally, gusts of strong wind (ranging from 20 to 50 miles per hour) automatically disperse fog, mists, and similar phenomena in the area, whether mundane or magical.",
    classes: ["druid"],
    components: { verbal: true, somatic: true, material: false },
    // Five distinct rounds, each its own save type and damage type — see
    // this file's header (Meteor Swarm precedent); utility row, numbers
    // carried only in prose.
  },
];
