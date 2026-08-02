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
// neither) end-to-end against a REAL seeded fork. featuresFromRows' pure
// truth table (untagged/level-gate/dedup) lives in class-feature-rows.test.ts.
//
// #1225 RETARGET: this used to pin Cleric/Life Domain's "Domain Spells" as a
// same-name fork — that 2024 row was FABRICATED (the PHB'14 list with its
// first tier relabelled) and #1225 replaced it with a DIFFERENTLY-NAMED real
// SRD 5.2 row ("Life Domain Spells"), so the property this test proves (a
// fork resolves to exactly one edition, never both, never neither) now needs
// a genuine same-name fork elsewhere in the seed — Warlock/The Fiend's own
// "Dark One's Blessing" (#1233) is that fork, level-shifted 1->3 same as
// Disciple of Life was, and is unrelated to any class this suite otherwise
// exercises.
describe("a real seeded edition fork resolves through deriveResources (#1374, retired from featureAppliesToEdition)", () => {
  it("Warlock/The Fiend's Dark One's Blessing: 2014 gets the 2014-worded row, 2024 gets the 2024-worded row, never both", async () => {
    const featureRows = await loadDbFeatureRows("warlock", "the fiend");
    const profBonus = proficiencyBonusForLevel(1);

    const at2014 = deriveResources("warlock", "the fiend", 1, ABILITY_SCORES, profBonus, featureRows, "EDITION_2014");
    const at2024 = deriveResources("warlock", "the fiend", 3, ABILITY_SCORES, proficiencyBonusForLevel(3), featureRows, "EDITION_2024");

    const blessing2014 = (at2014?.features ?? []).filter((f) => f.name === "Dark One's Blessing");
    const blessing2024 = (at2024?.features ?? []).filter((f) => f.name === "Dark One's Blessing");
    expect(blessing2014).toHaveLength(1);
    expect(blessing2024).toHaveLength(1);
    expect(blessing2014[0].description).not.toBe(blessing2024[0].description);
    expect(blessing2014[0].edition).toBe("EDITION_2014");
    expect(blessing2024[0].edition).toBe("EDITION_2024");
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
// Cleric's 16 triples (#1225), replacing the 2 Domain Spells entries above
// (that name is no longer tagged at all — both domains' 2024 rows renamed to
// "Life Domain Spells"/"Trickery Domain Spells", different names from the
// 2014-only "Domain Spells", same "renamed, not tagged" shape as Warlock's
// own Expanded Spell List -> Fiend Spells below). The 3 base-class names that
// genuinely fork (Spellcasting, Channel Divinity: Turn Undead, Divine
// Intervention — Destroy Undead/Divine Intervention Improvement are each
// replaced outright by a differently-named 2024 successor, so neither is
// tagged) show up under EVERY subclass context Cleric has (undefined/life
// domain/trickery domain), same reason Fighter's/Barbarian's/Warlock's own
// base names show up under all of THEIR contexts — 3 x 3 = 9, plus Life
// Domain's own 4 (Disciple of Life, Channel Divinity: Preserve Life, Blessed
// Healer, Supreme Healing — Bonus Proficiency/Divine Strike have no 2024 row
// at all, Domain Spells is renamed away) and Trickery Domain's own 3
// (Blessing of the Trickster, Channel Divinity: Invoke Duplicity, Improved
// Duplicity — Cloak of Shadows/Divine Strike have no 2024 row, Domain Spells
// is renamed away, Trickster's Transposition is 2024-only) = 9 + 4 + 3 = 16.
// Net +14 over the 2 entries removed.
const EXPECTED_EDITION_TAGGED_FEATURES = [
  ["cleric", "undefined", "Spellcasting"],
  ["cleric", "undefined", "Channel Divinity: Turn Undead"],
  ["cleric", "undefined", "Divine Intervention"],
  ["cleric", "life domain", "Spellcasting"],
  ["cleric", "life domain", "Channel Divinity: Turn Undead"],
  ["cleric", "life domain", "Divine Intervention"],
  ["cleric", "life domain", "Disciple of Life"],
  ["cleric", "life domain", "Channel Divinity: Preserve Life"],
  ["cleric", "life domain", "Blessed Healer"],
  ["cleric", "life domain", "Supreme Healing"],
  ["cleric", "trickery domain", "Spellcasting"],
  ["cleric", "trickery domain", "Channel Divinity: Turn Undead"],
  ["cleric", "trickery domain", "Divine Intervention"],
  ["cleric", "trickery domain", "Blessing of the Trickster"],
  ["cleric", "trickery domain", "Channel Divinity: Invoke Duplicity"],
  ["cleric", "trickery domain", "Improved Duplicity"],
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
  // Sorcerer's 19 new triples (#1232): the 4 base names that genuinely fork
  // (Spellcasting, Font of Magic, Metamagic, Sorcerous Restoration —
  // Sorcerous Origin -> Sorcerer Subclass is a RENAME, not a same-named fork,
  // so it never counts here) show up under EVERY subclass context Sorcerer
  // has (undefined/draconic bloodline/wild magic), same reason Wizard's 4
  // base names show up under all 4 of ITS contexts (collectTaggedFeatureKeys
  // combines classRows with EVERY subclass's own rows) — 4 x 3 = 12, plus
  // Draconic Bloodline's own 3 (Draconic Resilience, Elemental Affinity,
  // Dragon Wings — Dragon Ancestor/Draconic Spells and Draconic
  // Presence/Dragon Companion share no name, so neither of those RENAMED
  // pairs counts), plus Wild Magic's own 4 (Wild Magic Surge, Tides of
  // Chaos, Bend Luck, Controlled Chaos — Spell Bombardment/Tamed Surge share
  // no name, so that RENAMED pair doesn't count either) = 12 + 3 + 4 = 19.
  // Innate Sorcery/Sorcery Incarnate/Epic Boon/Arcane Apotheosis (base) and
  // Draconic Spells/Dragon Companion (Draconic Bloodline) and Tamed Surge
  // (Wild Magic) are NOT tagged — each is 2024-only, no 2014 twin to diverge
  // from.
  ["sorcerer", "undefined", "Spellcasting"],
  ["sorcerer", "undefined", "Font of Magic"],
  ["sorcerer", "undefined", "Metamagic"],
  ["sorcerer", "undefined", "Sorcerous Restoration"],
  ["sorcerer", "draconic bloodline", "Spellcasting"],
  ["sorcerer", "draconic bloodline", "Font of Magic"],
  ["sorcerer", "draconic bloodline", "Metamagic"],
  ["sorcerer", "draconic bloodline", "Sorcerous Restoration"],
  ["sorcerer", "draconic bloodline", "Draconic Resilience"],
  ["sorcerer", "draconic bloodline", "Elemental Affinity"],
  ["sorcerer", "draconic bloodline", "Dragon Wings"],
  ["sorcerer", "wild magic", "Spellcasting"],
  ["sorcerer", "wild magic", "Font of Magic"],
  ["sorcerer", "wild magic", "Metamagic"],
  ["sorcerer", "wild magic", "Sorcerous Restoration"],
  ["sorcerer", "wild magic", "Wild Magic Surge"],
  ["sorcerer", "wild magic", "Tides of Chaos"],
  ["sorcerer", "wild magic", "Bend Luck"],
  ["sorcerer", "wild magic", "Controlled Chaos"],
  // Bard's 30 new triples (#1224), derived from the test's own failure diff
  // (not hand-guessed, same discipline as Rogue's #1231): the 8 base names
  // that genuinely fork (Spellcasting, Bardic Inspiration, Jack of All
  // Trades, Expertise, Font of Inspiration, Countercharm, Magical Secrets,
  // Superior Inspiration — Song of Rest has no 2024 row at all, Epic Boon/
  // Words of Creation are 2024-only) show up under EVERY subclass context
  // Bard has (undefined/college of lore/college of valor — collectTagged
  // FeatureKeys combines classRows, always ALL of them, with each context's
  // own subclassRows) — 3 contexts x 8 base names = 24, plus College of
  // Lore's own 3 forked subclass names (Bonus Proficiencies, Cutting Words,
  // Peerless Skill — Additional Magical Secrets is renamed away to Magical
  // Discoveries, a 2024-only name, so never tagged) and College of Valor's
  // own 3 (Combat Inspiration, Extra Attack, Battle Magic — Bonus
  // Proficiencies is renamed away to Martial Training, a 2024-only name) =
  // 24 + 3 + 3 = 30.
  ["bard", "undefined", "Spellcasting"],
  ["bard", "undefined", "Bardic Inspiration"],
  ["bard", "undefined", "Jack of All Trades"],
  ["bard", "undefined", "Expertise"],
  ["bard", "undefined", "Font of Inspiration"],
  ["bard", "undefined", "Countercharm"],
  ["bard", "undefined", "Magical Secrets"],
  ["bard", "undefined", "Superior Inspiration"],
  ["bard", "college of lore", "Spellcasting"],
  ["bard", "college of lore", "Bardic Inspiration"],
  ["bard", "college of lore", "Jack of All Trades"],
  ["bard", "college of lore", "Expertise"],
  ["bard", "college of lore", "Font of Inspiration"],
  ["bard", "college of lore", "Countercharm"],
  ["bard", "college of lore", "Magical Secrets"],
  ["bard", "college of lore", "Superior Inspiration"],
  ["bard", "college of lore", "Bonus Proficiencies"],
  ["bard", "college of lore", "Cutting Words"],
  ["bard", "college of lore", "Peerless Skill"],
  ["bard", "college of valor", "Spellcasting"],
  ["bard", "college of valor", "Bardic Inspiration"],
  ["bard", "college of valor", "Jack of All Trades"],
  ["bard", "college of valor", "Expertise"],
  ["bard", "college of valor", "Font of Inspiration"],
  ["bard", "college of valor", "Countercharm"],
  ["bard", "college of valor", "Magical Secrets"],
  ["bard", "college of valor", "Superior Inspiration"],
  ["bard", "college of valor", "Combat Inspiration"],
  ["bard", "college of valor", "Extra Attack"],
  ["bard", "college of valor", "Battle Magic"],
  // Druid's 19 new triples (#1226): the 5 base names that genuinely fork
  // (Druidic, Spellcasting, Wild Shape, Beast Spells, Archdruid) show up
  // under EVERY subclass context Druid has (undefined/circle of the land/
  // circle of the moon — collectTaggedFeatureKeys combines classRows, always
  // ALL of them, with each context's own subclassRows) — 3 contexts x 5 base
  // names = 15, plus Circle of the Land's own 3 forked subclass names
  // (Natural Recovery, Nature's Ward, Nature's Sanctuary) and Circle of the
  // Moon's own 1 (Circle Forms) = 15 + 3 + 1 = 19. Timeless Body/Primal
  // Order/Wild Companion/Wild Resurgence/Elemental Fury/Improved Elemental
  // Fury/Epic Boon (base), Bonus Cantrip/Circle Spells (renamed away, see
  // below)/Land's Aid/Land's Stride (Land), and Combat Wild Shape/Primal
  // Strike/Circle of the Moon Spells/Improved Circle Forms/Elemental Wild
  // Shape/Moonlight Step/Thousand Forms/Lunar Form (Moon) are NOT tagged —
  // each has exactly one description under its name, either 2014-only or
  // 2024-only, never two. "Circle Spells" -> "Circle of the Land Spells" is a
  // RENAME, not a fork (Cleric's Domain Spells -> Life/Trickery Domain Spells
  // precedent, #1225) — neither name ever carries two descriptions, so
  // neither appears here.
  ["druid", "undefined", "Druidic"],
  ["druid", "undefined", "Spellcasting"],
  ["druid", "undefined", "Wild Shape"],
  ["druid", "undefined", "Beast Spells"],
  ["druid", "undefined", "Archdruid"],
  ["druid", "circle of the land", "Druidic"],
  ["druid", "circle of the land", "Spellcasting"],
  ["druid", "circle of the land", "Wild Shape"],
  ["druid", "circle of the land", "Beast Spells"],
  ["druid", "circle of the land", "Archdruid"],
  ["druid", "circle of the land", "Natural Recovery"],
  ["druid", "circle of the land", "Nature's Ward"],
  ["druid", "circle of the land", "Nature's Sanctuary"],
  ["druid", "circle of the moon", "Druidic"],
  ["druid", "circle of the moon", "Spellcasting"],
  ["druid", "circle of the moon", "Wild Shape"],
  ["druid", "circle of the moon", "Beast Spells"],
  ["druid", "circle of the moon", "Archdruid"],
  ["druid", "circle of the moon", "Circle Forms"],
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
