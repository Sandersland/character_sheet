// #1374: DerivedFeature.edition — the predicate that filters subclass/class
// feature TEXT by edition (mirrors Subclass.edition, #1306), plus the
// wire-boundary strip (#1272).
//
// #1524 REWRITE (arbiter-corrected AC): featureAppliesToEdition retired —
// feature TEXT now resolves from seeded ClassFeature rows via featuresFromRows
// (lib/classes/class-feature-rows.ts), the new "one place this rule lives".
// All four describe blocks below are DB-backed (loadDbFeatureRows) rather
// than calling deriveResources with bare strings, which post-swap derives an
// empty carrier and `features: []` for every class. featuresFromRows' own
// truth table (untagged/tagged/level-gate/dedup-by-construction) is unit-
// tested directly in class-feature-rows.test.ts; this file's job is the
// real-content sweep against the SEEDED catalog, which only a DB round-trip
// can prove. Both anti-vacuity floors (triplesVisited >= 158, subclassesVisited
// >= 31) and the EXPECTED_EDITION_TAGGED_FEATURES ledger carry across unedited.
import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
import type { DerivedFeature } from "@/lib/classes/types.js";
import { toWireFeatures } from "@/lib/character/serialize/classes.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { CLASS_SUBCLASSES, LITERAL_ROW_CLASSES } from "./class-subclasses.fixture.js";
import { loadDbFeatureRows } from "./db-feature-rows.fixture.js";

const ABILITY_SCORES = {
  strength: 14,
  dexterity: 16,
  constitution: 12,
  intelligence: 10,
  wisdom: 13,
  charisma: 15,
};

function feature(overrides: Partial<DerivedFeature> & Pick<DerivedFeature, "edition">): DerivedFeature {
  return { name: "Test Feature", level: 1, description: "test", source: "subclass", ...overrides };
}

// Replaces the old featureAppliesToEdition truth table: proves the SAME
// property (a fork resolves to exactly one edition's text, never both, never
// neither) end-to-end against a REAL seeded fork — Cleric/Life Domain's
// Domain Spells, also ledgered below. featuresFromRows' pure truth table
// (untagged/level-gate/dedup) lives in class-feature-rows.test.ts.
describe("a real seeded edition fork resolves through deriveResources (#1374, retired from featureAppliesToEdition)", () => {
  it("Cleric/Life Domain's Domain Spells: 2014 gets the 2014-worded row, 2024 gets the 2024-worded row, never both", async () => {
    const featureRows = await loadDbFeatureRows("cleric", "life domain");
    const profBonus = proficiencyBonusForLevel(1);

    const at2014 = deriveResources("cleric", "life domain", 1, ABILITY_SCORES, profBonus, featureRows, "EDITION_2014");
    const at2024 = deriveResources("cleric", "life domain", 3, ABILITY_SCORES, proficiencyBonusForLevel(3), featureRows, "EDITION_2024");

    const domainSpells2014 = (at2014?.features ?? []).filter((f) => f.name === "Domain Spells");
    const domainSpells2024 = (at2024?.features ?? []).filter((f) => f.name === "Domain Spells");
    expect(domainSpells2014).toHaveLength(1);
    expect(domainSpells2024).toHaveLength(1);
    expect(domainSpells2014[0].description).not.toBe(domainSpells2024[0].description);
    expect(domainSpells2014[0].edition).toBe("EDITION_2014");
    expect(domainSpells2024[0].edition).toBe("EDITION_2024");
  });

  it("mutation proof: deleting a class's EDITION_2024 rows fails on ABSENCE, not a 2014 fallback (ClassFeature.edition is non-nullable — resolveEditionRow's shared-row fallback is unreachable by type for this model)", async () => {
    const featureRows = await loadDbFeatureRows("cleric", "life domain");
    const only2014 = { classRows: featureRows.classRows.filter((r) => r.edition !== "EDITION_2024"), subclassRows: featureRows.subclassRows.filter((r) => r.edition !== "EDITION_2024") };

    const at2024 = deriveResources("cleric", "life domain", 3, ABILITY_SCORES, proficiencyBonusForLevel(3), only2014, "EDITION_2024");
    // Absence, not a silent 2014 fallback: the 2024 request derives ZERO
    // features from a carrier holding only 2014 rows.
    expect(at2024?.features ?? []).toHaveLength(0);
  });
});

// A fork always shares its `name` across the two edition-tagged rows (plan
// §C) — each edition still resolves to exactly one row per forked name — so
// this name-set-equality invariant holds. Meaningful today: it breaks if the
// base-layer filter ever excludes an untagged class feature by accident.
describe("real-content sweep: feature-name sets agree across editions (#1374 AC 2)", () => {
  it("every class × subclass at level 20 derives the same feature-name set under both editions", async () => {
    const profBonus = proficiencyBonusForLevel(20);
    let triplesVisited = 0;
    for (const [className, subclasses] of Object.entries(CLASS_SUBCLASSES)) {
      for (const subclass of subclasses) {
        const featureRows = await loadDbFeatureRows(className, subclass);
        const at2014 = deriveResources(className, subclass, 20, ABILITY_SCORES, profBonus, featureRows, "EDITION_2014");
        const at2024 = deriveResources(className, subclass, 20, ABILITY_SCORES, profBonus, featureRows, "EDITION_2024");
        const names2014 = new Set((at2014?.features ?? []).map((f) => f.name));
        const names2024 = new Set((at2024?.features ?? []).map((f) => f.name));
        // Fighter (#1227) was the first class whose 2024 content genuinely
        // diverges by design — it adds several 2024-only feature names
        // (Weapon Mastery, Tactical Mind, Two/Three Extra Attacks, ...) and
        // renames one (Battle Master's L18 "Improved Combat Superiority
        // (d12)" -> "Ultimate Combat Superiority"). Barbarian (#1223) is the
        // second: it adds Weapon Mastery/Primal Knowledge/Instinctive Pounce/
        // Brutal Strike/Improved Brutal Strike/Epic Boon, drops Brutal
        // Critical, and Path of the Totem Warrior loses all its features
        // outright (no 2024 successor authored). LITERAL_ROW_CLASSES is what
        // actually drives the exemption below — any class on that list has
        // its name sets SUPPOSED to differ across editions, not just these
        // two. Exempted from the equality check but still visited and still
        // counted toward the anti-vacuity floor below — dropping it from the
        // loop entirely would have silently shrunk that floor's real measured
        // value.
        if (!LITERAL_ROW_CLASSES.has(className)) {
          expect(names2014).toEqual(names2024);
        }
        triplesVisited += names2024.size;
      }
    }
    // Anti-vacuity floor: the issue's own count of source:"subclass" entries.
    expect(triplesVisited).toBeGreaterThanOrEqual(158);
  });
});

describe("toWireFeatures strips DerivedFeature.edition at the wire boundary (#1374, #1272)", () => {
  it("projects exactly {name, level, description, source}; a tagged feature's other fields survive verbatim", () => {
    const tagged = feature({ name: "Domain Spells", level: 1, description: "tagged text", edition: "EDITION_2014" });
    const untagged = feature({ name: "Bonus Proficiency", level: 1, description: "untagged text", edition: "EDITION_2024" });

    const wire = toWireFeatures([tagged, untagged]);

    expect(wire).toHaveLength(2);
    for (const f of wire) {
      expect(Object.keys(f).sort()).toEqual(["description", "level", "name", "source"]);
    }
    expect(wire[0]).toEqual({ name: "Domain Spells", level: 1, description: "tagged text", source: "subclass" });
  });
});

// Ledger: every (class, subclass, feature name) that legitimately carries an
// edition tag. Set-equality catches all four failure modes at once — a fork
// lost, a fork leaked to the wrong edition, a blanket tagging pass, and an
// accidental extra tag — none of which the name-set-equality sweep above can
// tell apart on its own (forks share a name by construction, so that sweep
// stays green even when a fork mistags).
// Fighter's 30 new triples (#1227). `collectTaggedFeatureKeys` combines
// `classRows` (Fighter's BASE rows — always ALL of them, regardless of which
// subclass was requested) with `subclassRows` (that one subclass's own rows)
// before calling taggedNamesFor — see loadDbFeatureRows.ts. So the 5 base
// names that diverge by edition (Fighting Style, Second Wind, Action Surge,
// Extra Attack, Indomitable) show up under EVERY subclass context Fighter
// has (undefined/battle master/champion/eldritch knight), not just once —
// 4 contexts x 5 base names = 20, plus Champion's own 5 and Battle Master's
// own 5 = 30. The base-class rows (subclass slot "undefined" below) come from
// CLASS_SUBCLASSES.fighter's own `undefined` entry, which
// collectTaggedFeatureKeys' template literal stringifies to the literal
// string "undefined" here — not a typo, matches the production key exactly.
// Two Fighter renames are DELIBERATELY excluded: Battle Master's L18
// "Improved Combat Superiority (d12)" (2014) / "Ultimate Combat Superiority"
// (2024) share no name, so they're two unrelated single-description rows,
// never a tagged pair (see fighter-features.ts's comment on that row). Every
// wholly 2024-only name (Weapon Mastery, Tactical Mind, Two/Three Extra
// Attacks, Tactical Shift, Tactical Master, Studied Attacks, Epic Boon,
// Heroic Warrior) has exactly one description under its name too — absent
// from a 2014 row entirely, not diverged from one — so none of those are
// tagged either.
// Barbarian's 31 new triples (#1223): the 9 base-class names that genuinely
// forked (Rage, Unarmored Defense, Danger Sense, Reckless Attack, Feral
// Instinct, Relentless Rage, Persistent Rage, Indomitable Might, Primal
// Champion) show up under EVERY subclass context Barbarian has
// (undefined/totem warrior/berserker), same reason Fighter's 5 base names
// show up under all 4 of ITS contexts (collectTaggedFeatureKeys combines
// classRows with EVERY subclass's own rows) — 9 x 3 = 27, plus Berserker's
// own 4 (Frenzy, Mindless Rage, Retaliation, Intimidating Presence) = 31.
// Extra Attack/Fast Movement are NOT here: both stay one untagged row per
// #1223's own decision (edition-invariant in wording, not just mechanics).
// Two Berserker level-shifts (Retaliation 14->10, Intimidating Presence
// 10->14) share their name across editions same as everything else here —
// taggedNamesFor keys on name alone, not level, so a level-shifted pair
// counts as "tagged" exactly like a same-level rewrite.
// Rogue's 53 new triples (#1231), derived from the test's own failure diff
// (not hand-guessed): 10 base-class names genuinely forked (Cunning Action,
// Elusive, Evasion, Expertise, Reliable Talent, Slippery Mind, Sneak Attack,
// Stroke of Luck, Thieves' Cant, Uncanny Dodge) show up under EVERY subclass
// context Rogue has (undefined/arcane trickster/assassin/thief) — 10 x 4 =
// 40 — plus Arcane Trickster's own 5 (Arcane Trickster Spellcasting, Mage
// Hand Legerdemain, Magical Ambush, Spell Thief, Versatile Trickster),
// Assassin's own 3 (Assassinate, Death Strike, Infiltration Expertise), and
// Thief's own 5 (Fast Hands, Second-Story Work, Supreme Sneak, Thief's
// Reflexes, Use Magic Device) = 53. Reliable Talent's level-shift (11->7)
// counts as "tagged" the same way Barbarian's Berserker level-shifts do —
// taggedNamesFor keys on name alone. Weapon Mastery/Steady Aim/Cunning
// Strike/Improved Cunning Strike/Devious Strikes/Epic Boon (base) and
// Assassin's Tools/Envenom Weapons (Assassin) are NOT here: each has exactly
// one description under its name (2024-only, no 2014 row to diverge from).
// Assassin's own Bonus Proficiencies/Impostor are the same "one description,
// no 2014 counterpart to fork against" shape, just on the 2014 side.
// Infiltration Expertise IS tagged (both editions have a row under that
// name) even though it's a same-name FORK rather than a rewrite — taggedNamesFor
// cannot distinguish the two shapes, and doesn't need to: either way the name
// legitimately carries two different descriptions.
// Warlock's 20 new triples (#1233): the 4 base-class names that genuinely
// fork (Pact Magic, Eldritch Invocations, Mystic Arcanum, Eldritch Master)
// show up under EVERY subclass context Warlock has (undefined/the fiend/the
// archfey/the great old one — collectTaggedFeatureKeys combines classRows,
// always ALL of them, with each context's own subclassRows) — 4 contexts x 4
// base names = 16, plus The Fiend's own 4 forked subclass names (Dark One's
// Blessing, Dark One's Own Luck, Fiendish Resilience, Hurl Through Hell) = 20.
// The three "Expanded Spell List" triples that used to be here are GONE, not
// merely renamed: The Fiend's row renames to "Fiend Spells" (a 2024-only
// name, so never tagged — one description, not two); The Archfey's/The Great
// Old One's rows are now EDITION_2014-only (zero 2024 rows authored at all,
// owner decision #1233), so each has exactly one description under its name
// too. Pact Boon (2014-only)/Magical Cunning/Contact Patron/Epic Boon
// (2024-only) are the same "one description under this name" shape, so none
// of those are tagged either.
const EXPECTED_EDITION_TAGGED_FEATURES = [
  ["cleric", "life domain", "Domain Spells"],
  ["cleric", "trickery domain", "Domain Spells"],
  ["warlock", "undefined", "Pact Magic"],
  ["warlock", "undefined", "Eldritch Invocations"],
  ["warlock", "undefined", "Mystic Arcanum"],
  ["warlock", "undefined", "Eldritch Master"],
  ["warlock", "the fiend", "Pact Magic"],
  ["warlock", "the fiend", "Eldritch Invocations"],
  ["warlock", "the fiend", "Mystic Arcanum"],
  ["warlock", "the fiend", "Eldritch Master"],
  ["warlock", "the fiend", "Dark One's Blessing"],
  ["warlock", "the fiend", "Dark One's Own Luck"],
  ["warlock", "the fiend", "Fiendish Resilience"],
  ["warlock", "the fiend", "Hurl Through Hell"],
  ["warlock", "the archfey", "Pact Magic"],
  ["warlock", "the archfey", "Eldritch Invocations"],
  ["warlock", "the archfey", "Mystic Arcanum"],
  ["warlock", "the archfey", "Eldritch Master"],
  ["warlock", "the great old one", "Pact Magic"],
  ["warlock", "the great old one", "Eldritch Invocations"],
  ["warlock", "the great old one", "Mystic Arcanum"],
  ["warlock", "the great old one", "Eldritch Master"],
  ["barbarian", "undefined", "Rage"],
  ["barbarian", "undefined", "Unarmored Defense"],
  ["barbarian", "undefined", "Danger Sense"],
  ["barbarian", "undefined", "Reckless Attack"],
  ["barbarian", "undefined", "Feral Instinct"],
  ["barbarian", "undefined", "Relentless Rage"],
  ["barbarian", "undefined", "Persistent Rage"],
  ["barbarian", "undefined", "Indomitable Might"],
  ["barbarian", "undefined", "Primal Champion"],
  ["barbarian", "totem warrior", "Rage"],
  ["barbarian", "totem warrior", "Unarmored Defense"],
  ["barbarian", "totem warrior", "Danger Sense"],
  ["barbarian", "totem warrior", "Reckless Attack"],
  ["barbarian", "totem warrior", "Feral Instinct"],
  ["barbarian", "totem warrior", "Relentless Rage"],
  ["barbarian", "totem warrior", "Persistent Rage"],
  ["barbarian", "totem warrior", "Indomitable Might"],
  ["barbarian", "totem warrior", "Primal Champion"],
  ["barbarian", "berserker", "Rage"],
  ["barbarian", "berserker", "Unarmored Defense"],
  ["barbarian", "berserker", "Danger Sense"],
  ["barbarian", "berserker", "Reckless Attack"],
  ["barbarian", "berserker", "Feral Instinct"],
  ["barbarian", "berserker", "Relentless Rage"],
  ["barbarian", "berserker", "Persistent Rage"],
  ["barbarian", "berserker", "Indomitable Might"],
  ["barbarian", "berserker", "Primal Champion"],
  ["barbarian", "berserker", "Frenzy"],
  ["barbarian", "berserker", "Mindless Rage"],
  ["barbarian", "berserker", "Retaliation"],
  ["barbarian", "berserker", "Intimidating Presence"],
  ["fighter", "undefined", "Fighting Style"],
  ["fighter", "undefined", "Second Wind"],
  ["fighter", "undefined", "Action Surge"],
  ["fighter", "undefined", "Extra Attack"],
  ["fighter", "undefined", "Indomitable"],
  ["fighter", "champion", "Fighting Style"],
  ["fighter", "champion", "Second Wind"],
  ["fighter", "champion", "Action Surge"],
  ["fighter", "champion", "Extra Attack"],
  ["fighter", "champion", "Indomitable"],
  ["fighter", "champion", "Improved Critical"],
  ["fighter", "champion", "Remarkable Athlete"],
  ["fighter", "champion", "Additional Fighting Style"],
  ["fighter", "champion", "Superior Critical"],
  ["fighter", "champion", "Survivor"],
  ["fighter", "battle master", "Fighting Style"],
  ["fighter", "battle master", "Second Wind"],
  ["fighter", "battle master", "Action Surge"],
  ["fighter", "battle master", "Extra Attack"],
  ["fighter", "battle master", "Indomitable"],
  ["fighter", "battle master", "Combat Superiority"],
  ["fighter", "battle master", "Student of War"],
  ["fighter", "battle master", "Know Your Enemy"],
  ["fighter", "battle master", "Improved Combat Superiority (d10)"],
  ["fighter", "battle master", "Relentless"],
  ["fighter", "eldritch knight", "Fighting Style"],
  ["fighter", "eldritch knight", "Second Wind"],
  ["fighter", "eldritch knight", "Action Surge"],
  ["fighter", "eldritch knight", "Extra Attack"],
  ["fighter", "eldritch knight", "Indomitable"],
  ["rogue", "undefined", "Cunning Action"],
  ["rogue", "undefined", "Elusive"],
  ["rogue", "undefined", "Evasion"],
  ["rogue", "undefined", "Expertise"],
  ["rogue", "undefined", "Reliable Talent"],
  ["rogue", "undefined", "Slippery Mind"],
  ["rogue", "undefined", "Sneak Attack"],
  ["rogue", "undefined", "Stroke of Luck"],
  ["rogue", "undefined", "Thieves' Cant"],
  ["rogue", "undefined", "Uncanny Dodge"],
  ["rogue", "arcane trickster", "Cunning Action"],
  ["rogue", "arcane trickster", "Elusive"],
  ["rogue", "arcane trickster", "Evasion"],
  ["rogue", "arcane trickster", "Expertise"],
  ["rogue", "arcane trickster", "Reliable Talent"],
  ["rogue", "arcane trickster", "Slippery Mind"],
  ["rogue", "arcane trickster", "Sneak Attack"],
  ["rogue", "arcane trickster", "Stroke of Luck"],
  ["rogue", "arcane trickster", "Thieves' Cant"],
  ["rogue", "arcane trickster", "Uncanny Dodge"],
  ["rogue", "arcane trickster", "Arcane Trickster Spellcasting"],
  ["rogue", "arcane trickster", "Mage Hand Legerdemain"],
  ["rogue", "arcane trickster", "Magical Ambush"],
  ["rogue", "arcane trickster", "Spell Thief"],
  ["rogue", "arcane trickster", "Versatile Trickster"],
  ["rogue", "assassin", "Cunning Action"],
  ["rogue", "assassin", "Elusive"],
  ["rogue", "assassin", "Evasion"],
  ["rogue", "assassin", "Expertise"],
  ["rogue", "assassin", "Reliable Talent"],
  ["rogue", "assassin", "Slippery Mind"],
  ["rogue", "assassin", "Sneak Attack"],
  ["rogue", "assassin", "Stroke of Luck"],
  ["rogue", "assassin", "Thieves' Cant"],
  ["rogue", "assassin", "Uncanny Dodge"],
  ["rogue", "assassin", "Assassinate"],
  ["rogue", "assassin", "Death Strike"],
  ["rogue", "assassin", "Infiltration Expertise"],
  ["rogue", "thief", "Cunning Action"],
  ["rogue", "thief", "Elusive"],
  ["rogue", "thief", "Evasion"],
  ["rogue", "thief", "Expertise"],
  ["rogue", "thief", "Reliable Talent"],
  ["rogue", "thief", "Slippery Mind"],
  ["rogue", "thief", "Sneak Attack"],
  ["rogue", "thief", "Stroke of Luck"],
  ["rogue", "thief", "Thieves' Cant"],
  ["rogue", "thief", "Uncanny Dodge"],
  ["rogue", "thief", "Fast Hands"],
  ["rogue", "thief", "Second-Story Work"],
  ["rogue", "thief", "Supreme Sneak"],
  ["rogue", "thief", "Thief's Reflexes"],
  ["rogue", "thief", "Use Magic Device"],
  // Wizard's 28 new triples (#1234): the 4 base names that genuinely fork
  // (Spellcasting, Arcane Recovery, Spell Mastery, Signature Spells) show up
  // under EVERY subclass context Wizard has (undefined/school of evocation/
  // school of abjuration/school of illusion), same reason Fighter's 5 base
  // names show up under all 4 of ITS contexts (collectTaggedFeatureKeys
  // combines classRows with EVERY subclass's own rows) — 4 x 4 = 16, plus
  // Evocation's own 5 (Evocation Savant, Sculpt Spells, Potent Cantrip,
  // Empowered Evocation, Overchannel — ALL five share a name across editions,
  // only level/wording shift), Abjuration's own 4 (Abjuration Savant, Arcane
  // Ward, Projected Ward, Spell Resistance — Improved Abjuration/Spell
  // Breaker share no name, so neither counts), and Illusion's own 3 (Illusion
  // Savant, Illusory Self, Illusory Reality — Improved Minor Illusion/
  // Improved Illusions and Malleable Illusions/Phantasmal Creatures each
  // share no name, so none of those four count) = 16 + 5 + 4 + 3 = 28.
  // Ritual Adept/Scholar/Memorize Spell/Epic Boon are NOT tagged (2024-only,
  // no 2014 twin to diverge from).
  ["wizard", "undefined", "Spellcasting"],
  ["wizard", "undefined", "Arcane Recovery"],
  ["wizard", "undefined", "Spell Mastery"],
  ["wizard", "undefined", "Signature Spells"],
  ["wizard", "school of evocation", "Spellcasting"],
  ["wizard", "school of evocation", "Arcane Recovery"],
  ["wizard", "school of evocation", "Spell Mastery"],
  ["wizard", "school of evocation", "Signature Spells"],
  ["wizard", "school of evocation", "Evocation Savant"],
  ["wizard", "school of evocation", "Sculpt Spells"],
  ["wizard", "school of evocation", "Potent Cantrip"],
  ["wizard", "school of evocation", "Empowered Evocation"],
  ["wizard", "school of evocation", "Overchannel"],
  ["wizard", "school of abjuration", "Spellcasting"],
  ["wizard", "school of abjuration", "Arcane Recovery"],
  ["wizard", "school of abjuration", "Spell Mastery"],
  ["wizard", "school of abjuration", "Signature Spells"],
  ["wizard", "school of abjuration", "Abjuration Savant"],
  ["wizard", "school of abjuration", "Arcane Ward"],
  ["wizard", "school of abjuration", "Projected Ward"],
  ["wizard", "school of abjuration", "Spell Resistance"],
  ["wizard", "school of illusion", "Spellcasting"],
  ["wizard", "school of illusion", "Arcane Recovery"],
  ["wizard", "school of illusion", "Spell Mastery"],
  ["wizard", "school of illusion", "Signature Spells"],
  ["wizard", "school of illusion", "Illusion Savant"],
  ["wizard", "school of illusion", "Illusory Self"],
  ["wizard", "school of illusion", "Illusory Reality"],
  // Ranger's 21 new triples (#1230): the 5 base names that genuinely fork
  // (Favored Enemy, Spellcasting, Fighting Style, Feral Senses, Foe Slayer)
  // show up under EVERY subclass context Ranger has (undefined/hunter/beast
  // master — collectTaggedFeatureKeys combines classRows, always ALL of
  // them, with each context's own subclassRows) — 3 contexts x 5 base names
  // = 15, plus Hunter's own 3 forked subclass names (Hunter's Prey,
  // Defensive Tactics, Superior Hunter's Defense) and Beast Master's own 3
  // (Exceptional Training, Bestial Fury, Share Spells) = 21. Extra Attack is
  // NOT here (one untagged row, edition-invariant). Neither are 2024-only
  // names (Weapon Mastery, Deft Explorer, Roving, Expertise, Tireless,
  // Relentless Hunter, Nature's Veil, Precise Hunter, Epic Boon, Hunter's
  // Lore, Superior Hunter's Prey, Primal Companion), nor 2014-only names
  // (Natural Explorer, Primeval Awareness, Land's Stride, Hide in Plain
  // Sight, Vanish, Giant Killer/Steel Will/Multiattack's parent rows,
  // Ranger's Companion) — each has exactly one description under its name,
  // not two. Ranger's Companion / Primal Companion is a RENAME (a different
  // name each edition), not a fork, same shape as Warlock's "Expanded Spell
  // List" -> "Fiend Spells".
  ["ranger", "undefined", "Favored Enemy"],
  ["ranger", "undefined", "Spellcasting"],
  ["ranger", "undefined", "Fighting Style"],
  ["ranger", "undefined", "Feral Senses"],
  ["ranger", "undefined", "Foe Slayer"],
  ["ranger", "hunter", "Favored Enemy"],
  ["ranger", "hunter", "Spellcasting"],
  ["ranger", "hunter", "Fighting Style"],
  ["ranger", "hunter", "Feral Senses"],
  ["ranger", "hunter", "Foe Slayer"],
  ["ranger", "hunter", "Hunter's Prey"],
  ["ranger", "hunter", "Defensive Tactics"],
  ["ranger", "hunter", "Superior Hunter's Defense"],
  ["ranger", "beast master", "Favored Enemy"],
  ["ranger", "beast master", "Spellcasting"],
  ["ranger", "beast master", "Fighting Style"],
  ["ranger", "beast master", "Feral Senses"],
  ["ranger", "beast master", "Foe Slayer"],
  ["ranger", "beast master", "Exceptional Training"],
  ["ranger", "beast master", "Bestial Fury"],
  ["ranger", "beast master", "Share Spells"],
] as const;

// A (class, subclass, name) is "tagged" if its two seeded rows carry
// DIFFERENT descriptions — an actual fork — mirrors the pre-#1524 in-memory
// check (`f.edition !== undefined` on a DerivedFeature literal), now
// expressed over ROWS instead: every DERIVED feature's edition is always
// defined post-#1524 (the type itself makes it required), so the old literal
// check is no longer meaningful — the fork now lives at the row layer.
// Split out of collectTaggedFeatureKeys so neither function nests past two
// loops (keeps both under the repo's cognitive-complexity gate).
function taggedNamesFor(rows: { name: string; description: string }[]): string[] {
  const descByName = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = descByName.get(row.name) ?? new Set<string>();
    set.add(row.description);
    descByName.set(row.name, set);
  }
  return [...descByName.entries()].filter(([, descs]) => descs.size > 1).map(([name]) => name);
}

async function collectTaggedFeatureKeys(): Promise<Set<string>> {
  const tagged = new Set<string>();
  for (const [className, subclasses] of Object.entries(CLASS_SUBCLASSES)) {
    for (const subclass of subclasses) {
      const featureRows = await loadDbFeatureRows(className, subclass);
      const rows = [...featureRows.classRows, ...featureRows.subclassRows];
      for (const name of taggedNamesFor(rows)) tagged.add(`${className}|${subclass}|${name}`);
    }
  }
  return tagged;
}

describe("edition-tagged feature ledger (#1374)", () => {
  it("only the ledgered (class, subclass, name) triples ever carry an edition tag", async () => {
    const tagged = await collectTaggedFeatureKeys();
    const expected = new Set(EXPECTED_EDITION_TAGGED_FEATURES.map(([c, s, n]) => `${c}|${s}|${n}`));
    expect(tagged).toEqual(expected);
  });
});

// Risk 2: if a future author tags a fork's two rows with the SAME edition
// instead of one each, mergeLayers would emit both under that edition while
// collectEntryScopedFeatures' name-dedup silently drops one — the two
// derivation paths would then disagree and the client would log a
// duplicate-key warning (ClassFeaturesList keys on `${source}-${name}`).
describe("per-edition duplicate-name invariant (#1374 risk 2)", () => {
  it("no class × subclass × edition derives two features sharing a name", async () => {
    const profBonus = proficiencyBonusForLevel(20);
    let subclassesVisited = 0;
    for (const [className, subclasses] of Object.entries(CLASS_SUBCLASSES)) {
      for (const subclass of subclasses) {
        if (subclass === undefined) continue;
        subclassesVisited++;
        const featureRows = await loadDbFeatureRows(className, subclass);
        for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
          const info = deriveResources(className, subclass, 20, ABILITY_SCORES, profBonus, featureRows, edition);
          const names = (info?.features ?? []).map((f) => f.name);
          expect(new Set(names).size).toBe(names.length);
        }
      }
    }
    // Anti-vacuity floor: the fixture's actual subclass-definition count.
    expect(subclassesVisited).toBeGreaterThanOrEqual(31);
  });
});
