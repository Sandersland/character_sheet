// PHB'14 (2014) Bard spell list — content slice of epic #1517 (#1717).
// Per the epic's row-ownership rule (tie-break Wizard > Cleric > Druid > Bard >
// Sorcerer > Warlock > Paladin > Ranger), Bard is 4th priority. Bard's own list
// overlaps heavily with Wizard/Cleric/Druid, so almost nothing is Bard's own
// territory: this file authors only the 5 spells where Bard is the
// HIGHEST-priority class present (i.e. none of Wizard/Cleric/Druid is on that
// spell's list) — Vicious Mockery, Heroism, Enthrall, Compulsion, Glibness.
//
// Source: dnd5eapi.co's 2014 spell set (/api/2014/classes/bard/spells, which
// enumerates exactly 111 spells across levels 0-9). Cross-checked every one
// of the 111 against its own /api/2014/spells/<slug> "classes" field to
// derive the tie-break owner:
//   - 87 sit on 3+ class lists -> already authored in shared.ts (#1713),
//     which already fans "bard" membership onto every one of them (verified:
//     87 "bard" tags in shared.ts == 87 3+-list PHB'14 Bard spells, zero gaps).
//     #1719 (Warlock)'s own manual sweep for spells absent from dnd5eapi
//     later found 3 MORE genuine PHB'14 Bard spells missing entirely (Cloud
//     of Daggers, Crown of Madness, Friends — all Bard/Sorcerer/Warlock/
//     Wizard 4-list) and added them to shared.ts, bumping Bard's real total
//     from 111 to 114; see spells-2014-bard-data.test.ts for the updated
//     count guard.
//   - 13 are Wizard-owned 2-list spells Bard also gets (Hideous Laughter,
//     Identify, Magic Mouth, Leomund's Tiny Hut, Otto's Irresistible Dance,
//     Programmed Illusion, Mordenkainen's Magnificent Mansion, Mordenkainen's
//     Sword, Project Image, Mind Blank, Mislead, Modify Memory, Guards and
//     Wards) — already tagged with bard membership in wizard.ts (#1714).
//   - 4 are Cleric-owned 2-list spells Bard also gets (Bane, Calm Emotions,
//     Speak with Dead, Resurrection) — already tagged with bard membership
//     in cleric.ts (#1715).
//   - 2 are Druid-owned 2-list spells Bard also gets (Heat Metal, Awaken) —
//     already tagged with bard membership in druid.ts (#1716).
//   All 19 of those wizard/cleric/druid-owned rows were individually
//   verified to already carry "bard" in classes[]; zero edits to any of
//   those three files were needed for this slice (87 + 13 + 4 + 2 + 5 = 111,
//   the full PHB'14 Bard list, with no double-count and no gap).
//   - The remaining 5 are Bard-owned (authored below): Vicious Mockery (L0),
//     Heroism (L1), Enthrall (L2), Compulsion (L4), Glibness (L8).
//
// Zero hand-transcribed or non-SRD spells in this slice — all 5 owned rows
// are verbatim SRD 5.1 text via dnd5eapi (cited SRD 5.1 as a whole rather
// than per-row, matching shared.ts/wizard.ts/cleric.ts/druid.ts's own
// convention), and none of the 5 carry a PHB'14 proper-noun title dnd5eapi
// genericized (that concern applies to Wizard-owned rows like Mordenkainen's
// Sword/Leomund's Tiny Hut, already handled in wizard.ts, not here).
//
// No scraping artifacts found in this slice's 5 rows (no "GM"
// genericization, no split-dice/bare-trailing-digit/duplicate-sentence/
// French-translation/markdown artifacts — the shapes prior slices found).
//
// This slice's prose-vs-structured-field audit found zero gaps: Vicious
// Mockery's dc/damage JSON was fully populated (unlike the Wizard/Cleric/
// Druid slices' documented gaps), and the other 4 owned rows carry no
// damage/attack shape at all (pure save-or-be-affected utility spells).
//
// dnd5eapi's own TEXT (not just structured fields) has a gap too: its 2014
// Heroism response silently drops the "At Higher Levels" sentence real
// SRD 5.1 carries (higher_level: [] in its JSON, despite the PHB'14 text
// genuinely having an upcast clause) — cross-checked and hand-restored from
// a second source (5thsrd.org, which mirrors the OGL SRD 5.1 text). The
// other 4 owned rows were individually cross-checked against the same
// second source and confirmed to have NO "At Higher Levels" clause in the
// real text (Enthrall, Compulsion, Glibness genuinely have none; Vicious
// Mockery's scaling is the cantrip-scaling sentence already present) — so
// dnd5eapi's JSON was complete for those 4, just not for Heroism.
import type { CatalogSpell } from "../spells.js";

export const BARD_SPELLS_2014: CatalogSpell[] = [
  // ── Cantrips ──────────────────────────────────────────────────────────────
  {
    name: "Vicious Mockery",
    level: 0,
    school: "enchantment",
    castingTime: "1 action",
    range: "60 feet",
    duration: "Instantaneous",
    description:
      "You unleash a string of insults laced with subtle enchantments at a creature you can see within range. If the target can hear you (though it need not understand you), it must succeed on a wisdom saving throw or take 1d4 psychic damage and have disadvantage on the next attack roll it makes before the end of its next turn. This spell's damage increases by 1d4 when you reach 5th level (2d4), 11th level (3d4), and 17th level (4d4).",
    classes: ["bard"],
    components: { verbal: true, somatic: false, material: false },
    attackType: "save",
    saveAbility: "wisdom",
    saveEffect: "none",
    effectKind: "damage",
    effectDiceCount: 1,
    effectDiceFaces: 4,
    damageType: "psychic",
    cantripScaling: true,
  },
  // ── Level 1 ───────────────────────────────────────────────────────────────
  {
    name: "Heroism",
    level: 1,
    school: "enchantment",
    castingTime: "1 action",
    range: "Touch",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "A willing creature you touch is imbued with bravery. Until the spell ends, the creature is immune to being frightened and gains temporary hit points equal to your spellcasting ability modifier at the start of each of its turns. When the spell ends, the target loses any remaining temporary hit points from this spell. At Higher Levels. When you cast this spell using a spell slot of 2nd level or higher, you can target one additional creature for each slot level above 1st.",
    classes: ["bard", "paladin"],
    components: { verbal: true, somatic: true, material: false },
    // A per-turn temporary-hit-points grant tied to the caster's own ability
    // modifier, not a fixed dice heal or an AC buff — doesn't fit the
    // effectKind:"heal" (single roll at cast time) or buffTarget channel,
    // matches Aid's "inexpressible as a dice heal" precedent from shared.ts.
  },
  // ── Level 2 ───────────────────────────────────────────────────────────────
  {
    name: "Enthrall",
    level: 2,
    school: "enchantment",
    castingTime: "1 action",
    range: "60 feet",
    duration: "1 minute",
    description:
      "You weave a distracting string of words, causing creatures of your choice that you can see within range and that can hear you to make a wisdom saving throw. Any creature that can't be charmed succeeds on this saving throw automatically, and if you or your companions are fighting a creature, it has advantage on the save. On a failed save, the target has disadvantage on Wisdom (Perception) checks made to perceive any creature other than you until the spell ends or until the target can no longer hear you. The spell ends if you are incapacitated or can no longer speak.",
    classes: ["bard", "warlock"],
    components: { verbal: true, somatic: true, material: false },
    attackType: "save",
    saveAbility: "wisdom",
    // The save gates a Perception-check disadvantage, not damage — no
    // effectKind (matches Bane's "save with no damage/effectKind" shape).
  },
  // ── Level 3 — none owned (all in shared.ts/other slices) ──
  // ── Level 4 ───────────────────────────────────────────────────────────────
  {
    name: "Compulsion",
    level: 4,
    school: "enchantment",
    castingTime: "1 action",
    range: "30 feet",
    duration: "Up to 1 minute",
    concentration: true,
    description:
      "Creatures of your choice that you can see within range and that can hear you must make a wisdom saving throw. A target automatically succeeds on this saving throw if it can't be charmed. On a failed save, a target is affected by this spell. Until the spell ends, you can use a bonus action on each of your turns to designate a direction that is horizontal to you. Each affected target must use as much of its movement as possible to move in that direction on its next turn. It can take any action before it moves. After moving in this way, it can make another Wisdom save to try to end the effect. A target isn't compelled to move into an obviously deadly hazard, such as a fire or a pit, but it will provoke opportunity attacks to move in the designated direction.",
    classes: ["bard"],
    components: { verbal: true, somatic: true, material: false },
    attackType: "save",
    saveAbility: "wisdom",
    // Forced movement, not damage/heal/AC — utility row, matches Enthrall's
    // "save gates a non-numeric consequence" shape one level down.
  },
  // ── Level 5 — none owned (all in shared.ts/other slices) ──
  // ── Level 6 — none owned (all in shared.ts/other slices) ──
  // ── Level 7 — none owned (all in shared.ts/other slices) ──
  // ── Level 8 ───────────────────────────────────────────────────────────────
  {
    name: "Glibness",
    level: 8,
    school: "transmutation",
    castingTime: "1 action",
    range: "Self",
    duration: "1 hour",
    description:
      "Until the spell ends, when you make a Charisma check, you can replace the number you roll with a 15. Additionally, no matter what you say, magic that would determine if you are telling the truth indicates that you are being truthful.",
    classes: ["bard", "warlock"],
    components: { verbal: true, somatic: false, material: false },
    // A check-replacement + truth-detection immunity, not a channel the
    // engine models (ac/heal/damage) — utility row.
  },
  // ── Level 9 — none owned (all in shared.ts/other slices) ──
];
