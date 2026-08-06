// PHB'14 (2014) Sorcerer spell list — content slice of epic #1517 (#1718).
// Per the epic's row-ownership rule (tie-break Wizard > Cleric > Druid > Bard
// > Sorcerer > Warlock > Paladin > Ranger), Sorcerer is 5th priority — and,
// unlike every prior by-class slice, this file authors ZERO rows. Sorcerer's
// full PHB'14 list (126 spells, cross-checked against dnd5eapi.co's
// /api/2014/classes/sorcerer/spells, which enumerates 120, plus 6 real
// PHB'14 Sorcerer spells absent from that SRD-based dataset — Chromatic Orb,
// Ray of Sickness, Witch Bolt, Cloud of Daggers, Crown of Madness, and
// Friends, the last three found by #1719 (Warlock)'s own manual sweep after
// this slice shipped) overlaps so heavily with Wizard (and, for a handful of
// spells, Cleric/Druid) that on EVERY one of those 126 spells, a
// higher-priority class is also present:
//   - 36 are Wizard-owned 2-list spells Sorcerer also gets (Acid Splash, Fire
//     Bolt, Ray of Frost, Shocking Grasp, Burning Hands, Chromatic Orb, Color
//     Spray, False Life, Mage Armor, Magic Missile, Ray of Sickness, Shield,
//     Alter Self, Blur, Enlarge/Reduce, Levitate, Scorching Ray, Web, Blink,
//     Fireball, Haste, Lightning Bolt, Slow, Cloudkill, Cone of Cold,
//     Creation, Telekinesis, Chain Lightning, Disintegrate, Globe of
//     Invulnerability, Delayed Blast Fireball, Prismatic Spray, Incendiary
//     Cloud, Meteor Swarm, Time Stop, Wish) — already tagged with sorcerer
//     membership in wizard.ts (#1714).
//   - 1 is a Druid-owned 2-list spell Sorcerer also gets (Dominate Beast) —
//     already tagged with sorcerer membership in druid.ts (#1716).
//   - 89 sit on 3+ class lists (including Witch Bolt, added to shared.ts by
//     this slice, plus Cloud of Daggers/Crown of Madness/Friends, added to
//     shared.ts by #1719 — see below) — authored in shared.ts (#1713), which
//     already fans "sorcerer" membership onto every one of them.
//   All 126 were individually verified to already carry "sorcerer" in
//   classes[]; zero edits to wizard.ts or druid.ts were needed for this
//   slice (36 + 1 + 89 = 126, the full PHB'14 Sorcerer list, no double-count,
//   no gap).
//
// The one real content gap this slice found: Witch Bolt (Sorcerer/Warlock/
// Wizard, PHB'14 p. 302) is a genuine 3-list PHB'14 spell that was missing
// from every prior slice's file entirely — dnd5eapi/open5e's SRD 5.1 dataset
// doesn't carry it, and wizard.ts's own header comment (#1714) had already
// flagged it as "a real gap...left unfixed to avoid touching a sibling
// slice's file." That gap directly blocked this issue's own acceptance
// criterion ("every PHB'14 Sorcerer spell resolves"), so it was fixed here by
// adding the row to shared.ts (its correct owner file per the row-ownership
// rule) rather than deferred again. Hand-transcribed and cross-checked
// against a second source (dnd5e.wikidot.com); see shared.ts's own per-row
// comment for the citation and sourcing detail.
//
// #1719 (Warlock) later found 3 more of the same gap class — Cloud of
// Daggers, Crown of Madness, and Friends, all Bard/Sorcerer/Warlock/Wizard
// 4-list spells absent from dnd5eapi entirely — and added them to shared.ts,
// which bumped this slice's own membership total from 123 to 126; see
// spells-2014-sorcerer-data.test.ts for the updated count guard.
//
// No other non-SRD/hand-transcribed Sorcerer spell was found beyond the 6
// now accounted for above (Chromatic Orb and Ray of Sickness, both already
// correctly transcribed and cited in wizard.ts; Witch Bolt, Cloud of
// Daggers, Crown of Madness, and Friends, all in shared.ts).
import type { CatalogSpell } from "../spells.js";

export const SORCERER_SPELLS_2014: CatalogSpell[] = [];
