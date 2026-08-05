// PHB'14 (2014) Warlock spell list — content slice of epic #1517 (#1719).
// Per the epic's row-ownership rule (tie-break Wizard > Cleric > Druid > Bard >
// Sorcerer > Warlock > Paladin > Ranger), Warlock is 6th priority — this file
// authors only the spells where NO higher-priority class (Wizard, Cleric,
// Druid, Bard, Sorcerer) is also on the PHB'14 list.
//
// Source: dnd5eapi.co's 2014 spell set (/api/2014/classes/warlock/spells,
// which enumerates exactly 64 spells across levels 0-9). Cross-checked every
// one of the 64 against its own /api/2014/spells/<slug> "classes" field to
// derive the tie-break owner, plus a manual sweep for real PHB'14 Warlock
// spells dnd5eapi's SRD-only dataset omits entirely (the same gap class
// #1718/Sorcerer found with Witch Bolt):
//   - 53 of the 64 sit on 3+ class lists -> already authored in shared.ts
//     (#1713), which already fans "warlock" membership onto every one of
//     them.
//   - 6 are Wizard-owned 2-list spells Warlock also gets (Ray of
//     Enfeeblement, Vampiric Touch, Contact Other Plane, Flesh to Stone,
//     Demiplane, Imprisonment) — already tagged with warlock membership in
//     wizard.ts (#1714).
//   - 1 is a Druid-owned 2-list spell Warlock also gets (Conjure Fey) —
//     already tagged with warlock membership in druid.ts (#1716).
//   - 2 are Bard-owned 2-list spells Warlock also gets (Enthrall, Glibness)
//     — already tagged with warlock membership in bard.ts (#1717).
//   All 62 of those shared/wizard/druid/bard-owned rows were individually
//   verified to already carry "warlock" in classes[]; zero edits to any of
//   those four files were needed for this slice.
//   - The remaining 2 of the 64 are Warlock-owned (authored below): Eldritch
//     Blast (L0) and Hellish Rebuke (L1), both verbatim SRD 5.1 text via
//     dnd5eapi (cited SRD 5.1 as a whole rather than per-row, matching
//     shared.ts/wizard.ts/cleric.ts/druid.ts/bard.ts's own convention).
//
// Beyond the API's 64, the manual sweep found 8 more real PHB'14 Warlock
// spells absent from dnd5eapi/open5e's SRD 5.1 dataset entirely (same class
// of gap as Witch Bolt, added to shared.ts by #1718):
//   - Witch Bolt (Sorcerer/Warlock/Wizard, 3-list) was already added to
//     shared.ts by #1718 with warlock membership — verified present, no
//     edit needed here.
//   - Cloud of Daggers, Crown of Madness, and Friends are Bard/Sorcerer/
//     Warlock/Wizard 4-list spells — shared.ts's territory, not this
//     slice's, so they're added to shared.ts (not here) by this slice,
//     fully membership-fanned across all four classes.
//   - Hex, Armor of Agathys, Arms of Hadar, and Hunger of Hadar are
//     Warlock-ONLY — authored below, hand-transcribed and cited per-row
//     (PHB'14 p.NN), each cross-checked word-for-word against a second
//     source (dnd5e.wikidot.com) beyond the primary source used
//     (5e-spellbook.app, which publishes 2014-vs-2024 diffed spell text).
//
// Net: 6 rows owned here (2 SRD + 4 hand-transcribed), 72 total PHB'14
// Warlock spells across all authoring files (53 + 6 + 1 + 2 + 6 + 4 = 72,
// the shared 53 counted above plus Witch Bolt/Cloud of Daggers/Crown of
// Madness/Friends = 57 shared rows total — see
// spells-2014-warlock-data.test.ts for the permanent membership-completeness
// guard).
import type { CatalogSpell } from "../spells.js";

export const WARLOCK_SPELLS_2014: CatalogSpell[] = [
  // ── Level 0 ────────────────────────────────────────────────────────────
  {
    name: "Eldritch Blast",
    level: 0,
    school: "evocation",
    castingTime: "1 action",
    range: "120 feet",
    duration: "Instantaneous",
    description:
      "A beam of crackling energy streaks toward a creature within range. Make a ranged spell attack against the target. On a hit, the target takes 1d10 force damage. The spell creates more than one beam when you reach higher levels: two beams at 5th level, three beams at 11th level, and four beams at 17th level. You can direct the beams at the same target or at different ones. Make a separate attack roll for each beam.",
    classes: ["warlock"],
    components: { verbal: true, somatic: true, material: false },
    attackType: "attack",
    effectKind: "damage",
    effectDiceCount: 1,
    effectDiceFaces: 10,
    damageType: "force",
  },
  // ── Level 1 ────────────────────────────────────────────────────────────
  {
    name: "Hellish Rebuke",
    level: 1,
    school: "evocation",
    castingTime: "1 reaction",
    range: "60 feet",
    duration: "Instantaneous",
    description:
      "You point your finger, and the creature that damaged you is momentarily surrounded by hellish flames. The creature must make a Dexterity saving throw. It takes 2d10 fire damage on a failed save, or half as much damage on a successful one. At Higher Levels. When you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d10 for each slot level above 1st.",
    classes: ["warlock"],
    components: { verbal: true, somatic: true, material: false },
    attackType: "save",
    saveAbility: "dexterity",
    saveEffect: "half",
    effectKind: "damage",
    effectDiceCount: 2,
    effectDiceFaces: 10,
    damageType: "fire",
    upcastDicePerLevel: 1,
  },
  // PHB'14 p. 251. Not in dnd5eapi/open5e's SRD 5.1 dataset. Cross-checked
  // word-for-word against a second source (dnd5e.wikidot.com/spell:hex),
  // which corroborates 5e-spellbook.app's 2014-edition text exactly,
  // including the "A remove curse cast on the target ends this spell early"
  // sentence and the 8-hour/24-hour concentration-extension upcast clause.
  // The 1d6 necrotic damage is a RIDER paid out on the caster's own later
  // attacks, not a direct spell-cast damage instance — same shape as
  // Hunter's Mark (2024 catalog) — so no effectKind/attackType is set;
  // documented as a conditional/multi-effect exception in this slice's data
  // test so the prose-vs-field audit doesn't misflag it.
  {
    name: "Hex",
    level: 1,
    school: "enchantment",
    castingTime: "1 bonus action",
    range: "90 feet",
    duration: "Up to 1 hour",
    concentration: true,
    description:
      "You place a curse on a creature that you can see within range. Until the spell ends, you deal an extra 1d6 necrotic damage to the target whenever you hit it with an attack. Also, choose one ability when you cast the spell. The target has disadvantage on ability checks made with the chosen ability. If the target drops to 0 hit points before this spell ends, you can use a bonus action on a subsequent turn of yours to curse a new creature. A remove curse cast on the target ends this spell early. At Higher Levels. When you cast this spell using a spell slot of 3rd or 4th level, you can maintain your concentration on the spell for up to 8 hours. When you use a spell slot of 5th level or higher, you can maintain your concentration on the spell for up to 24 hours.",
    classes: ["warlock"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "the petrified eye of a newt" },
  },
  // PHB'14 p. 215. Not in dnd5eapi/open5e's SRD 5.1 dataset. Cross-checked
  // word-for-word against a second source
  // (dnd5e.wikidot.com/spell:armor-of-agathys), which corroborates
  // 5e-spellbook.app's 2014-edition text exactly. The 5 temporary hit points
  // and the 5 cold damage are both FLAT (no dice at all in either edition),
  // and the temp-HP grant is inexpressible via effectKind:"heal" (a single
  // dice roll at cast time) — same "no effectKind" shape as False Life
  // (wizard.ts) and Heroism (bard.ts), both of which also grant temporary
  // hit points with no structured effect field.
  {
    name: "Armor of Agathys",
    level: 1,
    school: "abjuration",
    castingTime: "1 action",
    range: "Self",
    duration: "1 hour",
    description:
      "A protective magical force surrounds you, manifesting as a spectral frost that covers you and your gear. You gain 5 temporary hit points for the duration. If a creature hits you with a melee attack while you have these hit points, the creature takes 5 cold damage. At Higher Levels. When you cast this spell using a spell slot of 2nd level or higher, both the temporary hit points and the cold damage increase by 5 for each slot level above 1st.",
    classes: ["warlock"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "a cup of water" },
  },
  // PHB'14 p. 215. Not in dnd5eapi/open5e's SRD 5.1 dataset. Cross-checked
  // word-for-word against a second source
  // (dnd5e.wikidot.com/spell:arms-of-hadar), which corroborates
  // 5e-spellbook.app's 2014-edition text exactly, including the "half as
  // much damage but suffers no other effect" success clause and the flat
  // 1d6-per-slot-level upcast.
  {
    name: "Arms of Hadar",
    level: 1,
    school: "conjuration",
    castingTime: "1 action",
    range: "Self (10-foot radius)",
    duration: "Instantaneous",
    description:
      "You invoke the power of Hadar, the Dark Hunger. Tendrils of dark energy erupt from you and batter all creatures within 10 feet of you. Each creature in that area must make a Strength saving throw. On a failed save, a target takes 2d6 necrotic damage and can't take reactions until its next turn. On a successful save, the creature takes half as much damage but suffers no other effect. At Higher Levels. When you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d6 for each slot level above 1st.",
    classes: ["warlock"],
    components: { verbal: true, somatic: true, material: false },
    attackType: "save",
    saveAbility: "strength",
    saveEffect: "half",
    effectKind: "damage",
    effectDiceCount: 2,
    effectDiceFaces: 6,
    damageType: "necrotic",
    upcastDicePerLevel: 1,
  },
  // ── Level 2 — none owned (all in shared.ts/other slices) ──
  // PHB'14 p. 251. Not in dnd5eapi/open5e's SRD 5.1 dataset. Cross-checked
  // word-for-word against a second source
  // (dnd5e.wikidot.com/spell:hunger-of-hadar), which corroborates
  // 5e-spellbook.app's 2014-edition text exactly; neither source carries an
  // "At Higher Levels" clause for this spell. Genuinely TWO damage
  // instances of different types on different triggers (2d6 cold,
  // unconditional, at the start of a creature's turn in the area; 2d6 acid,
  // gated by a Dexterity save, at the end of its turn) — no single
  // effectKind/attackType/damageType captures both, the same "two fixed
  // types, no single instance" shape as Meteor Swarm (wizard.ts) —
  // documented as a conditional/multi-effect exception in this slice's data
  // test.
  {
    name: "Hunger of Hadar",
    level: 3,
    school: "conjuration",
    castingTime: "1 action",
    range: "150 feet",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "You open a gateway to the dark between the stars, a region infested with unknown horrors. A 20-foot-radius sphere of blackness and bitter cold appears, centered on a point within range and lasting for the duration. This void is filled with a cacophony of soft whispers and slurping noises that can be heard up to 30 feet away. No light, magical or otherwise, can illuminate the area, and creatures fully within the area are blinded. The void creates a warp in the fabric of space, and the area is difficult terrain. Any creature that starts its turn in the area takes 2d6 cold damage. Any creature that ends its turn in the area must succeed on a Dexterity saving throw or take 2d6 acid damage as milky, otherworldly tentacles rub against it.",
    classes: ["warlock"],
    components: { verbal: true, somatic: true, material: true, materialDescription: "a pickled octopus tentacle" },
  },
  // ── Level 4 — none owned (all in shared.ts/other slices) ──
  // ── Level 5 — none owned (all in shared.ts/other slices) ──
  // ── Level 6 — none owned (all in shared.ts/other slices) ──
  // ── Level 7 — none owned (all in shared.ts/other slices) ──
  // ── Level 8 — none owned (all in shared.ts/other slices) ──
  // ── Level 9 — none owned (all in shared.ts/other slices) ──
];
