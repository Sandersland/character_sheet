// Structural invariants on the per-domain seed modules. NO database — pure
// data checks that guard the bugs a data-move refactor can silently introduce:
// a duplicate business key (upsert-by-name would collapse two rows into one), a
// GrantedAbility name colliding across the four sources (they share one unique
// name column), or a dangling reference (a subclass on a class that doesn't
// exist, a pack listing an item the catalog lacks). Mirrors the fail-fast guard
// in seed.ts main().
import { describe, it, expect } from "vitest";

import { bard } from "@/lib/classes/bard.js";
import { cleric } from "@/lib/classes/cleric.js";
import { druid } from "@/lib/classes/druid.js";
import { monk } from "@/lib/classes/monk.js";
import { paladin } from "@/lib/classes/paladin.js";
import { ranger } from "@/lib/classes/ranger.js";
import { sorcerer } from "@/lib/classes/sorcerer.js";
import type { ClassDefinition } from "@/lib/classes/types.js";
import { warlock } from "@/lib/classes/warlock.js";
import { wizard } from "@/lib/classes/wizard.js";

import { BACKGROUNDS, CLASSES, ITEMS } from "../catalog-data.js";
import { ACTIONS, TWENTY_FOUR_ONLY_ACTION_KEYS } from "../actions.js";
import { SUBCLASSES } from "../subclasses.js";
import { MANEUVERS } from "../maneuvers.js";
import { SHADOW_ARTS } from "../shadow-arts.js";
import { CHANNEL_DIVINITIES } from "../channel-divinity.js";
import { FEATS } from "../feats.js";
import { SPELLS, SPELL_RENAMES, type CatalogSpell } from "../spells.js";
import { PACKS } from "../packs.js";
import { SUBCLASS_GRANTED_SPELLS } from "../subclass-granted-spells.js";
import { SUBCLASS_SPELL_LIST_EXPANSIONS } from "../subclass-spell-list-expansions.js";
import { FEAT_IMPROVEMENT_TARGETS } from "@/lib/srd/feats.js";
import { cantripsKnownAtLevel, preparedSpellCountAt } from "@/lib/srd/srd.js";
import { subclassGateLevel } from "@/lib/leveling/effective-levels.js";
import { SUBCLASS_SLUGS, SUBCLASS_IDENTITY, type SubclassSlug } from "@/lib/classes/subclass-slug.js";
import { REGRANTED_UNIVERSAL_KEYS } from "@/lib/classes/actions.js";

// The values that repeat when a list has a duplicate on `key`.
const duplicates = <T>(values: T[]): T[] =>
  [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];

describe("SUBCLASS_GRANTED_SPELLS — referential integrity", () => {
  // A feature that says "you know the X cantrip" must have a matching grant row,
  // or the cantrip never reaches the sheet (the #1247 Elementalism bug: seeded
  // spell, no link). Guard that every grant points at seeded content.
  it("every grant references a seeded spell and a seeded subclass", () => {
    const spellNames = new Set(SPELLS.map((s) => s.name));
    const subclassKeys = new Set(SUBCLASSES.map((s) => `${s.className}::${s.name}`));
    for (const g of SUBCLASS_GRANTED_SPELLS) {
      expect(spellNames.has(g.spellName), `unseeded spell: ${g.spellName}`).toBe(true);
      expect(
        subclassKeys.has(`${g.className}::${g.subclassName}`),
        `unseeded subclass: ${g.className}::${g.subclassName}`,
      ).toBe(true);
    }
  });

  it("Warrior of the Elements grants Elementalism at L3 (Manipulate Elements, #1247)", () => {
    const grant = SUBCLASS_GRANTED_SPELLS.find(
      (g) => g.className === "Monk" && g.subclassName === "Warrior of the Elements" && g.spellName === "Elementalism",
    );
    expect(grant).toBeDefined();
    expect(grant!.gateLevel).toBe(3);
    expect(grant!.castingAbility).toBe("wisdom");
  });

  // #1625: the Warrior of * grants are PHB'24/SRD 5.2-native content on their
  // OWN edition-tagged Subclass rows — untagged, they would leak across
  // editions. Way of Shadow's own Minor Illusion grant (#1502) joined this
  // list tagged EDITION_2014, for the same reason in the other direction.
  it("every Monk grant is tagged its subclass's own edition (#1625, #1502)", () => {
    const monkGrants = SUBCLASS_GRANTED_SPELLS.filter((g) => g.className === "Monk");
    expect(monkGrants.map((g) => `${g.subclassName}::${g.spellName}::${g.edition}`).sort()).toEqual([
      "Warrior of Shadow::Minor Illusion::EDITION_2024",
      "Warrior of the Elements::Elementalism::EDITION_2024",
      "Way of Shadow::Minor Illusion::EDITION_2014",
    ]);
  });

  // #1625: the widened DB unique still ADMITS a shared (NULL) row alongside a
  // tagged twin for the same (subclass, spell) — deriveGrantedSpells' set
  // filter would then serve BOTH rows to one character. Structurally forbidden
  // here at authoring time instead: per (subclass, spell), either one shared
  // row XOR per-edition rows, never a mix, and never a duplicate edition.
  it("per (subclass, spell): one shared row XOR per-edition rows, no duplicate edition (#1625)", () => {
    const editionsByPair = new Map<string, (string | null)[]>();
    for (const g of SUBCLASS_GRANTED_SPELLS) {
      const key = `${g.className}::${g.subclassName}::${g.spellName}`;
      const editions = editionsByPair.get(key) ?? [];
      editions.push(g.edition ?? null);
      editionsByPair.set(key, editions);
    }
    for (const [key, editions] of editionsByPair) {
      if (editions.includes(null)) {
        expect(editions, `${key}: a shared (untagged) row must be the pair's ONLY row`).toHaveLength(1);
      }
      expect(new Set(editions).size, `${key}: duplicate rows for one edition`).toBe(editions.length);
    }
  });
});

describe("SUBCLASS_SPELL_LIST_EXPANSIONS — referential integrity (#1631)", () => {
  it("every row references a seeded spell and a seeded subclass", () => {
    const spellNames = new Set(SPELLS.map((s) => s.name));
    const subclassKeys = new Set(SUBCLASSES.map((s) => `${s.className}::${s.name}`));
    for (const e of SUBCLASS_SPELL_LIST_EXPANSIONS) {
      expect(spellNames.has(e.spellName), `unseeded spell: ${e.spellName}`).toBe(true);
      expect(
        subclassKeys.has(`${e.className}::${e.subclassName}`),
        `unseeded subclass: ${e.className}::${e.subclassName}`,
      ).toBe(true);
    }
  });

  // The Fiend/Archfey/Great Old One's ten-spell PHB'14 "Expanded Spell List"
  // each, exactly as transcribed in warlock-features.ts's FIEND_RAW/
  // ARCHFEY_RAW/GREAT_OLD_ONE_RAW EDITION_2014 rows.
  it("each of the three 2014 patrons carries its exact ten-spell list", () => {
    const listFor = (subclassName: string) =>
      SUBCLASS_SPELL_LIST_EXPANSIONS.filter((e) => e.className === "Warlock" && e.subclassName === subclassName)
        .map((e) => e.spellName)
        .sort();
    expect(listFor("The Fiend")).toEqual(
      ["Blindness/Deafness", "Burning Hands", "Command", "Fire Shield", "Fireball", "Flame Strike", "Hallow", "Scorching Ray", "Stinking Cloud", "Wall of Fire"].sort(),
    );
    expect(listFor("The Archfey")).toEqual(
      ["Blink", "Calm Emotions", "Dominate Beast", "Dominate Person", "Faerie Fire", "Greater Invisibility", "Phantasmal Force", "Plant Growth", "Seeming", "Sleep"].sort(),
    );
    expect(listFor("The Great Old One")).toEqual(
      ["Black Tentacles", "Clairvoyance", "Detect Thoughts", "Dissonant Whispers", "Dominate Beast", "Dominate Person", "Hideous Laughter", "Phantasmal Force", "Sending", "Telekinesis"].sort(),
    );
  });

  // #1631's owner decision: 2014's list-expansion and 2024's always-prepared
  // Fiend Spells are different mechanisms over overlapping-but-not-identical
  // lists, so The Fiend's rows here are all EDITION_2014 — never shared with
  // its SubclassGrantedSpell twin (subclass-granted-spells.ts), which is the
  // "one shared row XOR per-edition rows" guard applied ACROSS the two
  // families rather than within one, since a spell present in BOTH lists
  // (e.g. Burning Hands) must resolve through exactly one mechanism per
  // character, never both.
  it("every row is tagged EDITION_2014 — no row is shared with a SubclassGrantedSpell twin", () => {
    const untagged = SUBCLASS_SPELL_LIST_EXPANSIONS.filter((e) => e.edition !== "EDITION_2014").map(
      (e) => `${e.subclassName}::${e.spellName}::${e.edition ?? "shared"}`,
    );
    expect(untagged, "every #1631 patron row must be EDITION_2014").toEqual([]);
  });

  it("no (subclass, spell) pair appears in both SUBCLASS_SPELL_LIST_EXPANSIONS and SUBCLASS_GRANTED_SPELLS for the SAME edition", () => {
    const expansionKeys = new Set(
      SUBCLASS_SPELL_LIST_EXPANSIONS.map((e) => `${e.className}::${e.subclassName}::${e.spellName}::${e.edition ?? "shared"}`),
    );
    const collisions = SUBCLASS_GRANTED_SPELLS.filter((g) =>
      expansionKeys.has(`${g.className}::${g.subclassName}::${g.spellName}::${g.edition ?? "shared"}`),
    );
    expect(collisions, "a (subclass, spell, edition) triple must resolve through exactly one mechanism").toEqual([]);
  });
});

// #1308: CLASSES.subclassLevel holds the PHB'14 gate (subclassGateLevel ignores
// it entirely under 2024), so a reseed that "cleans up" these to a uniform 3
// would silently regress every 2014 campaign's subclass timing. Pins the exact
// PHB'14 citations rather than just checking they're non-3.
describe("CLASSES — 2014 subclass gate levels (#1308)", () => {
  const subclassLevelByName = new Map(CLASSES.map((c) => [c.name, c.subclassLevel]));

  it("Cleric/Sorcerer/Warlock gate at 1st level (Divine Domain/Sorcerous Origin/Otherworldly Patron, PHB'14 pp. 57/99/105)", () => {
    expect(subclassLevelByName.get("Cleric")).toBe(1);
    expect(subclassLevelByName.get("Sorcerer")).toBe(1);
    expect(subclassLevelByName.get("Warlock")).toBe(1);
  });

  it("Druid/Wizard gate at 2nd level (Druid Circle/Arcane Tradition, PHB'14 pp. 66/114)", () => {
    expect(subclassLevelByName.get("Druid")).toBe(2);
    expect(subclassLevelByName.get("Wizard")).toBe(2);
  });

  it("every other class stays at 3rd level", () => {
    const early = new Set(["Cleric", "Sorcerer", "Warlock", "Druid", "Wizard"]);
    const wrong = CLASSES.filter((c) => !early.has(c.name) && c.subclassLevel !== 3).map((c) => c.name);
    expect(wrong, "classes drifted off the 3rd-level default").toEqual([]);
  });
});

describe("per-domain business-key uniqueness", () => {
  // Keyed on (key, edition) rather than key alone: since #1430 every universal
  // action repeats its key once per edition, so only a same-key/same-edition
  // collision (including two `undefined` = shared rows) would collapse in
  // seedActions' upsert. Replaces the old "ACTIONS have unique keys".
  it("ACTIONS have unique (key, edition) pairs", () => {
    expect(duplicates(ACTIONS.map((a) => `${a.key}::${a.edition ?? "shared"}`))).toEqual([]);
  });

  // No universal row may stay edition-NULL: resolveEditionCatalog would then
  // fall back to it for BOTH editions and the fork would be invisible.
  //
  // "metamagic" is the one sanctioned class-row exception (#1232 commit 2b):
  // SRD 5.2 grants Metamagic at Sorcerer level 2, PHB'14 at level 3, so this
  // row forks the same way a universal row does. This catalog's class rows
  // aren't consumed by any route (lib/classes/actions.ts's own header) — the
  // real gate is DERIVED_ACTIONS' own metamagic fork — but the description
  // text still needs to name the right level per edition, and the ONE
  // exception is a set, mirroring TWENTY_FOUR_ONLY_ACTION_KEYS's shape, not a
  // loosened predicate that could hide a future accidental class-row fork.
  //
  // "divineSense"/"layOnHands" join it (#1229): divineSense is EDITION_2014-
  // only (2024 removed it as its own resource pool/action — its job moves to
  // the "Channel Divinity: Divine Sense" catalog option, cast through the
  // abilities endpoint, not this actions dispatch), and layOnHands' cost
  // forks to a Bonus Action in 2024 (SRD 5.2) with a reworded description
  // (drops the disease clause). Same non-route-consumed reasoning as
  // metamagic — the real gate is DERIVED_ACTIONS' own twin rows
  // (lib/classes/actions.ts).
  it("every universal ACTION carries an edition; every class action stays shared, except the sanctioned metamagic/divineSense/layOnHands forks", () => {
    const SANCTIONED_CLASS_FORKS = new Set(["metamagic", "divineSense", "layOnHands"]);
    expect(ACTIONS.filter((a) => a.universal && !a.edition).map((a) => a.key)).toEqual([]);
    expect(ACTIONS.filter((a) => !a.universal && a.edition && !SANCTIONED_CLASS_FORKS.has(a.key)).map((a) => a.key)).toEqual([]);
  });

  // The two editions must offer the same universal affordances apart from the
  // declared 2024-only ones — a key seeded for one edition only would silently
  // vanish from the other's Action sheet.
  it("the 2014 and 2024 universal key sets differ only by TWENTY_FOUR_ONLY_ACTION_KEYS", () => {
    const keysFor = (edition: string) =>
      ACTIONS.filter((a) => a.universal && a.edition === edition).map((a) => a.key).sort();
    const keys2014 = keysFor("EDITION_2014");
    const keys2024 = keysFor("EDITION_2024");
    expect(keys2024.filter((k) => !keys2014.includes(k))).toEqual([...TWENTY_FOUR_ONLY_ACTION_KEYS].sort());
    expect(keys2014.filter((k) => !keys2024.includes(k))).toEqual([]);
  });

  // #1431: a DERIVED_ACTIONS row re-costs universal actions by KEY, and the
  // client resolves each key against the row referenceRouter serves for the
  // character's OWN edition — so a key with no counterpart in one edition would
  // render an empty grant for exactly the characters that edition serves. The
  // `cost` half matters just as much: `regrants` means "you may take this
  // action for my cost instead of its own", which is only meaningful if the
  // universal row still costs an action. Closes a different gap from #1315's
  // (class-row-vs-seed-class-row drift) — this one is class row → universal row.
  it("every REGRANTED_UNIVERSAL_KEYS entry is a universal, action-cost row in BOTH editions (#1431)", () => {
    expect(REGRANTED_UNIVERSAL_KEYS.length).toBeGreaterThan(0);
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      for (const key of REGRANTED_UNIVERSAL_KEYS) {
        const row = ACTIONS.find((a) => a.key === key && a.universal && a.edition === edition);
        expect(row, `regranted key "${key}" has no universal ${edition} row`).toBeDefined();
        expect(row!.cost, `regranted key "${key}" (${edition}) must still cost an action`).toBe("action");
      }
    }
  });

  it("SUBCLASSES have unique (className, name) pairs", () => {
    expect(duplicates(SUBCLASSES.map((s) => `${s.className}::${s.name}`))).toEqual([]);
  });

  it("MANEUVERS have unique names", () => {
    expect(duplicates(MANEUVERS.map((m) => m.name))).toEqual([]);
  });

  // Keyed on (name, edition) rather than name alone (#1415/#1502): "Shadow
  // Arts: Darkness" legitimately repeats its name once per edition (a
  // genuine mechanical fork — 1 focus vs 2 ki) — only a same-name/
  // same-edition collision would collapse in the DB's (name, edition) upsert.
  it("SHADOW_ARTS have unique (name, edition) pairs", () => {
    expect(duplicates(SHADOW_ARTS.map((s) => `${s.name}::${s.edition}`))).toEqual([]);
  });

  // Keyed on (name, edition) rather than name alone (#1229): Nature's Wrath
  // legitimately repeats its name once per edition (a genuine mechanical
  // fork — saveAbility dexterity vs strength) — only a same-name/same-edition
  // collision would collapse in the DB's upsert. Mirrors FEATS' own
  // (name, edition) key below.
  it("CHANNEL_DIVINITIES have unique (name, edition) pairs", () => {
    expect(duplicates(CHANNEL_DIVINITIES.map((c) => `${c.name}::${c.edition ?? "shared"}`))).toEqual([]);
  });

  // Keyed on (name, edition) rather than name alone: a feat that genuinely
  // diverges by edition (Alert, #1306) legitimately repeats its name once per
  // edition — only a same-name/same-edition collision (including two `undefined`
  // = shared rows) would collapse in the DB's upsert.
  it("FEATS have unique (name, edition) pairs", () => {
    expect(duplicates(FEATS.map((f) => `${f.name}::${f.edition ?? "shared"}`))).toEqual([]);
  });

  it("SPELLS have unique names", () => {
    expect(duplicates(SPELLS.map((s) => s.name))).toEqual([]);
  });

  it("PACKS have unique names, and each pack's contents have unique item names", () => {
    expect(duplicates(PACKS.map((p) => p.name))).toEqual([]);
    for (const pack of PACKS) {
      expect(
        duplicates(pack.contents.map((c) => c.itemName)),
        `pack "${pack.name}" lists a duplicate item`,
      ).toEqual([]);
    }
  });
});

// SRD 5.2.1 pp. 87-88 + PHB'24 feat categories (#1129).
describe("FEATS — PHB'24 category invariants", () => {
  it("every feat carries a category", () => {
    const missing = FEATS.filter((f) => !f.category).map((f) => f.name);
    expect(missing, "feats without a category").toEqual([]);
  });

  // #1310: scoped to EDITION_2024 — PHB'14's "general" rows (below) carry no
  // levelPrerequisite (PHB'14 p.165 has no per-feat level gate) and 13 of the
  // 18 shared General names grant no PHB'14 ability bump.
  it("2024 General feats have levelPrerequisite 4, a nonempty abilityOptions, and abilityIncrease 1", () => {
    for (const f of FEATS.filter((f) => f.category === "general" && f.edition === "EDITION_2024")) {
      expect(f.levelPrerequisite, `${f.name} levelPrerequisite`).toBe(4);
      expect((f.abilityOptions ?? []).length, `${f.name} abilityOptions`).toBeGreaterThan(0);
      expect(f.abilityIncrease, `${f.name} abilityIncrease`).toBe(1);
    }
  });

  it("Epic Boon feats have levelPrerequisite 19 and abilityIncrease 1", () => {
    for (const f of FEATS.filter((f) => f.category === "epic_boon")) {
      expect(f.levelPrerequisite, `${f.name} levelPrerequisite`).toBe(19);
      expect(f.abilityIncrease, `${f.name} abilityIncrease`).toBe(1);
    }
  });

  it("Origin feats carry no levelPrerequisite", () => {
    const withLevel = FEATS.filter((f) => f.category === "origin" && f.levelPrerequisite != null).map((f) => f.name);
    expect(withLevel, "origin feats with a levelPrerequisite").toEqual([]);
  });

  it("Fighting Style feats name their Fighting Style prerequisite", () => {
    for (const f of FEATS.filter((f) => f.category === "fighting_style")) {
      expect(f.prerequisite ?? "", `${f.name} prerequisite`).toContain("Fighting Style");
    }
  });

  // #1137: the mechanical Fighting Style feats carry the same derived effects the
  // former scalar styles applied — Archery +2 ranged attack, Defense +1 AC while
  // armored, Two-Weapon Fighting the off-hand ability-mod marker. Great Weapon
  // Fighting stays descriptive (its reroll is not automated).
  it("Fighting Style feats carry their derived improvements", () => {
    const byName = new Map(FEATS.map((f) => [f.name, f]));
    expect(byName.get("Archery")?.improvements).toEqual([{ target: "rangedAttackRoll", amount: 2 }]);
    expect(byName.get("Defense")?.improvements).toEqual([{ target: "armorClassWhileArmored", amount: 1 }]);
    expect(byName.get("Two-Weapon Fighting")?.improvements).toEqual([
      { target: "offhandAbilityDamage", amount: 1 },
    ]);
    expect(byName.get("Great Weapon Fighting")?.improvements ?? []).toEqual([]);
  });

  // #1306 worked example, superseded by #1310: Grappler now forks too — every
  // Feat row is edition-tagged (empty shared-NULL set, ACTIONS/#1430 precedent),
  // so "Grappler stays one shared row" (#1306's original illustration) is
  // deliberately inverted here rather than left passing for the wrong reason.
  it("Alert AND Grappler both fork by edition (SRD 5.2 vs PHB'14 p.165; SRD 5.2 vs SRD 5.1)", () => {
    const alerts = FEATS.filter((f) => f.name === "Alert");
    expect(alerts).toHaveLength(2);
    expect(alerts.map((f) => f.edition).sort()).toEqual(["EDITION_2014", "EDITION_2024"]);
    const alert2014 = alerts.find((f) => f.edition === "EDITION_2014")!;
    const alert2024 = alerts.find((f) => f.edition === "EDITION_2024")!;
    expect(alert2014.improvements).toEqual([{ target: "initiative", amount: 5 }]);
    expect(alert2024.improvements).toEqual([{ target: "initiative", amount: 1, scaling: "proficiencyBonus" }]);
    // #1310: PHB'14 has no Origin taxonomy — the 2014 row's category moves to
    // "general" (the corollary is it takes an ASI slot; the 2024 row stays
    // "origin", background-granted only).
    expect(alert2014.category).toBe("general");
    expect(alert2024.category).toBe("origin");

    const grapplers = FEATS.filter((f) => f.name === "Grappler");
    expect(grapplers).toHaveLength(2);
    expect(grapplers.map((f) => f.edition).sort()).toEqual(["EDITION_2014", "EDITION_2024"]);
    const grappler2014 = grapplers.find((f) => f.edition === "EDITION_2014")!;
    const grappler2024 = grapplers.find((f) => f.edition === "EDITION_2024")!;
    // 2014 (SRD 5.1): no ability bump, flat Strength 13+ prerequisite.
    expect(grappler2014.abilityIncrease).toBeUndefined();
    expect(grappler2014.prerequisite).toBe("Strength 13+");
    // 2024: adds the half-feat bump and a Strength-or-Dexterity choice.
    expect(grappler2024.abilityIncrease).toBe(1);
  });

  it("only Magic Initiate and Skilled are repeatable", () => {
    const repeatable = FEATS.filter((f) => f.repeatable).map((f) => f.name).sort();
    expect(repeatable).toEqual(["Magic Initiate", "Skilled"]);
  });

  it("every improvement target is a known FEAT_IMPROVEMENT_TARGET", () => {
    const allowed = new Set<string>(FEAT_IMPROVEMENT_TARGETS);
    const unknown = FEATS.flatMap((f) => (f.improvements ?? []).map((i) => i.target)).filter((t) => !allowed.has(t));
    expect([...new Set(unknown)], "unknown improvement targets").toEqual([]);
  });

  it("seeds the 16 SRD 5.2.1 feats (17 minus Ability Score Improvement)", () => {
    const names = new Set(FEATS.map((f) => f.name));
    const srd = [
      "Alert", "Magic Initiate", "Savage Attacker", "Skilled", "Grappler",
      "Archery", "Defense", "Great Weapon Fighting", "Two-Weapon Fighting",
      "Boon of Combat Prowess", "Boon of Dimensional Travel", "Boon of Fate",
      "Boon of Irresistible Offense", "Boon of Spell Recall", "Boon of the Night Spirit",
      "Boon of Truesight",
    ];
    const missing = srd.filter((n) => !names.has(n));
    expect(missing, "missing SRD 5.2.1 feats").toEqual([]);
  });
});

// PHB'14 p. 72 (Fighter) / p. 82 (Paladin) / p. 91 (Ranger), = SRD 5.1 (#1311).
// A 2014 Fighting Style has six options; SRD 5.2 has four (Dueling and
// Protection have no 2024 counterpart). Per-class option gating (Fighter gets
// all six, Paladin/Ranger a four-style subset each) is #1495, not this issue.
describe("FEATS — 2014 Fighting Style feats (#1311)", () => {
  const STYLES_2014 = ["Archery", "Defense", "Dueling", "Great Weapon Fighting", "Protection", "Two-Weapon Fighting"];
  const STYLES_2024 = ["Archery", "Defense", "Great Weapon Fighting", "Two-Weapon Fighting"];

  it("seeds exactly the six PHB'14 Fighting Style feats as EDITION_2014 rows", () => {
    const names = FEATS.filter((f) => f.category === "fighting_style" && f.edition === "EDITION_2014")
      .map((f) => f.name)
      .sort();
    expect(names).toEqual([...STYLES_2014].sort());
  });

  it("the four SRD 5.2 Fighting Style feats are stamped EDITION_2024, not left shared", () => {
    const rows = FEATS.filter((f) => f.category === "fighting_style" && STYLES_2024.includes(f.name) && f.edition === "EDITION_2024");
    expect(rows.map((f) => f.name).sort()).toEqual([...STYLES_2024].sort());
  });

  it("no fighting_style row is left edition-NULL (ACTIONS/#1430 precedent: no universal row)", () => {
    const shared = FEATS.filter((f) => f.category === "fighting_style" && !f.edition).map((f) => f.name);
    expect(shared).toEqual([]);
  });

  it("Dueling and Protection exist only as EDITION_2014 rows (no SRD 5.2 counterpart)", () => {
    for (const name of ["Dueling", "Protection"]) {
      const rows = FEATS.filter((f) => f.name === name);
      expect(rows, name).toHaveLength(1);
      expect(rows[0].edition, name).toBe("EDITION_2014");
      expect(rows[0].category, name).toBe("fighting_style");
    }
  });

  it("2014 Archery/Defense/Two-Weapon Fighting carry the same derived improvement as their 2024 sibling", () => {
    const byNameEdition = (name: string, edition: "EDITION_2014" | "EDITION_2024") =>
      FEATS.find((f) => f.name === name && f.edition === edition);

    expect(byNameEdition("Archery", "EDITION_2014")?.improvements).toEqual(byNameEdition("Archery", "EDITION_2024")?.improvements);
    expect(byNameEdition("Defense", "EDITION_2014")?.improvements).toEqual(byNameEdition("Defense", "EDITION_2024")?.improvements);
    expect(byNameEdition("Two-Weapon Fighting", "EDITION_2014")?.improvements).toEqual(
      byNameEdition("Two-Weapon Fighting", "EDITION_2024")?.improvements,
    );
  });

  it("2014 Great Weapon Fighting, Dueling, and Protection stay descriptive (not automated)", () => {
    for (const name of ["Great Weapon Fighting", "Dueling", "Protection"]) {
      const row = FEATS.find((f) => f.name === name && f.edition === "EDITION_2014");
      expect(row?.improvements ?? [], name).toEqual([]);
    }
  });

  it("every 2014 Fighting Style feat names its Fighting Style prerequisite", () => {
    for (const name of STYLES_2014) {
      const row = FEATS.find((f) => f.name === name && f.edition === "EDITION_2014");
      expect(row?.prerequisite ?? "", name).toContain("Fighting Style");
    }
  });
});

// PHB'14 pp. 165-170 (#1310): restores the 2014 half of the catalog `6491c528`
// (#1154) replaced. PHB'14 has no Origin/Fighting Style/Epic Boon taxonomy, so
// every 2014 row is "general" with no levelPrerequisite — featOfferedForAsiSlot's
// `?? 4` default IS the 2014 "earliest ASI is level 4" rule, not a fudge.
describe("FEATS — 2014 general/origin catalog (#1310)", () => {
  const feats2014 = () => FEATS.filter((f) => f.edition === "EDITION_2014" && f.category !== "fighting_style");

  it("seeds exactly 26 EDITION_2014 general-category rows (the 24 6491c528 deleted, plus Grappler and Savage Attacker)", () => {
    const rows = feats2014();
    expect(rows).toHaveLength(26);
    expect(rows.every((f) => f.category === "general")).toBe(true);
    expect(rows.every((f) => f.levelPrerequisite == null)).toBe(true);
  });

  it("contains Mobile, not Speedy; the 2024 catalog has Speedy, not Mobile", () => {
    const names2014 = new Set(feats2014().map((f) => f.name));
    expect(names2014.has("Mobile")).toBe(true);
    expect(names2014.has("Speedy")).toBe(false);

    const names2024 = new Set(FEATS.filter((f) => f.edition === "EDITION_2024").map((f) => f.name));
    expect(names2024.has("Speedy")).toBe(true);
    expect(names2024.has("Mobile")).toBe(false);
  });

  it("Mobile carries the +10 speed improvement recovered verbatim from the pre-#1154 catalog", () => {
    const mobile = feats2014().find((f) => f.name === "Mobile");
    expect(mobile?.improvements).toEqual([{ target: "speed", amount: 10 }]);
  });

  it("2014 Grappler has no ability bump and a flat Strength 13+ prerequisite (SRD 5.1)", () => {
    const grappler = feats2014().find((f) => f.name === "Grappler");
    expect(grappler?.prerequisite).toBe("Strength 13+");
    expect(grappler?.abilityOptions ?? []).toEqual([]);
    expect(grappler?.abilityIncrease).toBeUndefined();
  });

  it("2014 Savage Attacker is melee-only and grants no ability bump (PHB'14, distinct from 2024's any-weapon Origin version)", () => {
    const savageAttacker = feats2014().find((f) => f.name === "Savage Attacker");
    expect(savageAttacker?.description).toMatch(/melee weapon attack/i);
    expect(savageAttacker?.abilityOptions ?? []).toEqual([]);
  });

  it("2014 Weapon Master states the weapon choice in its description and carries no hardcoded improvements", () => {
    const weaponMaster = feats2014().find((f) => f.name === "Weapon Master");
    expect(weaponMaster?.description).toMatch(/of your choice/i);
    expect(weaponMaster?.improvements ?? []).toEqual([]);
  });

  it("2014 Magic Initiate and Skilled are not repeatable (PHB'14 p.165: once-only unless stated otherwise)", () => {
    for (const name of ["Magic Initiate", "Skilled"]) {
      const row = feats2014().find((f) => f.name === name);
      expect(row?.repeatable, name).toBeFalsy();
    }
  });

  it("carries zero rows of category origin, fighting_style, or epic_boon", () => {
    const rows = FEATS.filter((f) => f.edition === "EDITION_2014");
    const offCategory = rows.filter((f) => (["origin", "epic_boon"] as const).includes(f.category as never));
    expect(offCategory.map((f) => f.name)).toEqual([]);
  });

  it("no Feat row is left edition-NULL — every row (2014 or 2024) carries an edition", () => {
    const shared = FEATS.filter((f) => !f.edition).map((f) => f.name);
    expect(shared).toEqual([]);
  });

  // The four originFeatName values BACKGROUNDS references — buildOriginEntry
  // resolves them by name against the creating character's edition and returns
  // null on a miss (character-create.ts), so a gap here would silently drop a
  // background's Origin feat grant for whichever edition the miss lands on.
  it("every BACKGROUNDS originFeatName has both an EDITION_2014 and EDITION_2024 row", () => {
    const originFeatNames = [...new Set(BACKGROUNDS.map((b) => b.originFeatName).filter((n): n is string => !!n))];
    expect(originFeatNames.length).toBeGreaterThan(0);
    for (const name of originFeatNames) {
      const editions = FEATS.filter((f) => f.name === name).map((f) => f.edition).sort();
      expect(editions, name).toEqual(["EDITION_2014", "EDITION_2024"]);
    }
  });
});

// #1131: the creation spell picker needs real choice — strictly MORE spells on a
// class's list than it takes at level 1, so a fresh caster is never forced.
describe("SPELLS — creation picker coverage (#1131)", () => {
  const onList = (cls: string, level: number) =>
    SPELLS.filter((s) => s.level === level && s.classes.includes(cls)).length;

  it("every cantrip-casting class has more cantrips than it knows at level 1", () => {
    for (const cls of ["bard", "cleric", "druid", "sorcerer", "wizard", "warlock"]) {
      expect(onList(cls, 0), `${cls} cantrips`).toBeGreaterThan(cantripsKnownAtLevel(cls, 1));
    }
  });

  it("every level-1 caster has more first-level spells than it prepares at level 1", () => {
    for (const cls of ["bard", "cleric", "druid", "sorcerer", "wizard", "warlock", "paladin", "ranger"]) {
      expect(onList(cls, 1), `${cls} L1 spells`).toBeGreaterThan(preparedSpellCountAt(cls, 1, null, {}, "EDITION_2024") ?? 0);
    }
  });
});

// SRD 5.2 spell resweep (#1132): shape invariants the value-by-value catalog
// edits must never break. The class list is the authority — a spell offering
// itself outside its SRD list is the leak bug the resweep fixes.
describe("SPELLS — structured-field invariants (#1132)", () => {
  const CLASS_NAMES = new Set([
    "barbarian", "bard", "cleric", "druid", "fighter", "monk",
    "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard",
  ]);

  it("every spell's classes[] is non-empty and lowercase ⊆ the 12 classes", () => {
    const bad = SPELLS.filter(
      (s) => s.classes.length === 0 || s.classes.some((c) => c !== c.toLowerCase() || !CLASS_NAMES.has(c)),
    ).map((s) => s.name);
    expect(bad, "spells with an empty or unknown class list").toEqual([]);
  });

  it("cantripScaling only on cantrips (level 0)", () => {
    const bad = SPELLS.filter((s) => s.cantripScaling && s.level !== 0).map((s) => s.name);
    expect(bad, "leveled spell flagged cantripScaling").toEqual([]);
  });

  it("saveEffect implies a save-based attack", () => {
    const bad = SPELLS.filter((s) => s.saveEffect && s.attackType !== "save").map((s) => s.name);
    expect(bad, "saveEffect without attackType 'save'").toEqual([]);
  });

  it("buff fields appear iff effectKind is 'buff'", () => {
    const bad = SPELLS.filter((s) => {
      const hasBuffFields = s.buffTarget != null || s.buffModifier != null;
      return hasBuffFields !== (s.effectKind === "buff");
    }).map((s) => s.name);
    expect(bad, "buff fields not matching effectKind 'buff'").toEqual([]);
  });

  it("upcastDicePerLevel only on leveled spells (level ≥ 1)", () => {
    const bad = SPELLS.filter((s) => s.upcastDicePerLevel != null && s.level < 1).map((s) => s.name);
    expect(bad, "cantrip with upcastDicePerLevel").toEqual([]);
  });

  it("every SUBCLASS_GRANTED_SPELLS.spellName exists in SPELLS", () => {
    const names = new Set(SPELLS.map((s) => s.name));
    const dangling = SUBCLASS_GRANTED_SPELLS.filter((g) => !names.has(g.spellName)).map((g) => g.spellName);
    expect([...new Set(dangling)], "granted spell not in the catalog").toEqual([]);
  });

  it("SPELL_RENAMES: no source name still in SPELLS, every target name in SPELLS", () => {
    const names = new Set(SPELLS.map((s) => s.name));
    const strandedSources = SPELL_RENAMES.filter((r) => names.has(r.from)).map((r) => r.from);
    const missingTargets = SPELL_RENAMES.filter((r) => !names.has(r.to)).map((r) => r.to);
    expect(strandedSources, "rename source still present in SPELLS").toEqual([]);
    expect(missingTargets, "rename target missing from SPELLS").toEqual([]);
  });
});

// SRD 5.2 value spot-checks (#1132) — the load-bearing deltas per level band.
// Not exhaustive: guards the mechanics that changed and the class-list leak fix.
// `get` throws (definite CatalogSpell, no optional chains → low complexity);
// `has` covers the removed/renamed presence checks.
const get = (name: string): CatalogSpell => {
  const s = SPELLS.find((sp) => sp.name === name);
  if (!s) throw new Error(`SPELLS has no "${name}"`);
  return s;
};
const has = (name: string): boolean => SPELLS.some((s) => s.name === name);

describe("SRD 5.2 catalog values — CHUNK 1 cantrips + L1 (#1132)", () => {
  it("removes Toll the Dead (no 2024 version) and renames Tasha's Hideous Laughter", () => {
    expect(has("Toll the Dead")).toBe(false);
    expect(has("Tasha's Hideous Laughter")).toBe(false);
    expect(has("Hideous Laughter")).toBe(true);
    expect(SPELL_RENAMES).toContainEqual({ from: "Tasha's Hideous Laughter", to: "Hideous Laughter" });
  });

  it("applies cantrip deltas (dice, class lists, components, duration)", () => {
    expect(get("Vicious Mockery").effectDiceFaces).toBe(6);
    expect(get("Mage Hand").classes).toContain("warlock");
    expect(get("Prestidigitation").classes).toContain("warlock");
    expect(get("Prestidigitation").duration).toBe("1 hour");
    expect(get("Minor Illusion").components?.verbal).toBe(false);
  });

  it("upgrades the healing spells to 2dX abjuration", () => {
    const cure = get("Cure Wounds");
    expect([cure.effectDiceCount, cure.upcastDicePerLevel, cure.school]).toEqual([2, 2, "abjuration"]);
    expect(cure.classes).toEqual(expect.arrayContaining(["paladin", "ranger"]));
    const hw = get("Healing Word");
    expect([hw.effectDiceCount, hw.upcastDicePerLevel, hw.school]).toEqual([2, 2, "abjuration"]);
  });

  it("fixes the L1 class lists (leak fix + additions/removals)", () => {
    expect(get("Thunderwave").classes).not.toContain("cleric");
    expect(get("Detect Magic").classes.length).toBe(8);
    expect(get("Bane").classes).toContain("warlock");
    expect(get("Command").classes).toContain("bard");
    expect(get("Command").duration).toBe("Instantaneous");
    expect(get("Dissonant Whispers").classes).toEqual(["bard"]); // GOO leak fix
    expect(get("Protection from Evil and Good").classes).toContain("druid");
    expect(get("Sanctuary").classes).toEqual(["cleric"]);
  });

  it("redesigns Sleep and re-types Hunter's Mark damage", () => {
    const sleep = get("Sleep");
    expect(sleep.concentration).toBe(true);
    expect(sleep.range).toBe("60 ft");
    expect(sleep.effectDiceCount).toBeUndefined(); // 5d8 HP pool dropped
    expect(sleep.description).toContain("Incapacitated");
    expect(get("Hunter's Mark").description).toContain("Force");
  });
});

describe("SRD 5.2 catalog values — CHUNK 2 L2 + L3 (#1132)", () => {
  it("Barkskin becomes a non-concentration bonus-action floor-17 buff", () => {
    const bark = get("Barkskin");
    expect(bark.castingTime).toBe("1 bonus action");
    expect(bark.concentration).toBeFalsy();
    expect(bark.duration).toBe("1 hour");
    expect(bark.buffModifier).toBe(17);
  });

  it("makes Spiritual Weapon concentration with upcast scaling", () => {
    const sw = get("Spiritual Weapon");
    expect(sw.concentration).toBe(true);
    expect(sw.duration).toBe("Concentration, up to 1 minute");
    expect(sw.upcastDicePerLevel).toBe(1);
  });

  it("applies L2 class-list + field deltas", () => {
    expect(get("Misty Step").classes).toEqual(expect.arrayContaining(["warlock"]));
    expect(get("Misty Step").classes).not.toContain("bard");
    expect(get("Shatter").classes).not.toContain("cleric");
    expect(get("Hold Person").classes).toEqual(expect.arrayContaining(["sorcerer", "warlock"]));
    expect(get("Mirror Image").classes).toContain("bard");
    const bd = get("Blindness/Deafness");
    expect(bd.school).toBe("transmutation");
    expect(bd.range).toBe("120 ft");
    expect(get("Lesser Restoration").castingTime).toBe("1 bonus action");
    expect(get("Phantasmal Force").description).toContain("2d8");
  });

  it("applies L3 class-list + field deltas", () => {
    expect(get("Counterspell").classes).toEqual(["sorcerer", "warlock", "wizard"]);
    const mhw = get("Mass Healing Word");
    expect([mhw.effectDiceCount, mhw.school]).toEqual([2, "abjuration"]);
    expect(get("Gaseous Form").classes).toContain("warlock");
    expect(get("Dispel Magic").classes.length).toBe(8);
    expect(get("Blink").description).toContain("d6");
    const sending = get("Sending");
    expect(sending.school).toBe("divination");
    expect(sending.duration).toBe("Instantaneous");
  });
});

describe("SRD 5.2 catalog values — CHUNK 3 L4 + L5 (#1132)", () => {
  it("renames Evard's Black Tentacles → Black Tentacles in place", () => {
    expect(has("Evard's Black Tentacles")).toBe(false);
    expect(has("Black Tentacles")).toBe(true);
    expect(SPELL_RENAMES).toContainEqual({ from: "Evard's Black Tentacles", to: "Black Tentacles" });
  });

  it("applies L4 deltas", () => {
    expect(get("Stoneskin").school).toBe("transmutation");
    expect(get("Stoneskin").description).not.toContain("nonmagical");
    expect(get("Banishment").range).toBe("30 ft");
    expect(get("Banishment").description).toContain("Incapacitated");
    expect(get("Fire Shield").classes).toEqual(expect.arrayContaining(["druid", "sorcerer"]));
    expect(get("Dominate Beast").classes).toContain("ranger");
    expect(get("Ice Storm").description).toContain("2d10");
  });

  it("applies L5 deltas", () => {
    expect(get("Cone of Cold").classes).toContain("druid");
    expect(get("Flame Strike").classes).toEqual(["cleric"]);
    expect(get("Hallow").school).toBe("abjuration");
    expect(get("Hold Monster").description).not.toContain("not undead");
    const mcw = get("Mass Cure Wounds");
    expect([mcw.effectDiceCount, mcw.school]).toEqual([5, "abjuration"]);
  });
});

describe("SRD 5.2 catalog values — CHUNK 4 additions (#1132)", () => {
  const ADDED = [
    "Aid", "Suggestion", "Invisibility", "Hypnotic Pattern", "Nondetection",
    "Aura of Life", "Confusion", "Geas", "Insect Plague", "Greater Restoration",
  ];

  it("seeds all 10 new spells", () => {
    expect(ADDED.filter((n) => !has(n))).toEqual([]);
  });

  it("gives each new spell a legal level and class list", () => {
    for (const name of ADDED) {
      const s = get(name);
      expect(s.level, `${name} level`).toBeGreaterThanOrEqual(2);
      expect(s.classes.length, `${name} classes`).toBeGreaterThan(0);
    }
  });

  it("captures the load-bearing structured fields", () => {
    expect(get("Hypnotic Pattern").components?.verbal).toBe(false); // S, M only
    const ip = get("Insect Plague");
    expect([ip.effectDiceCount, ip.effectDiceFaces, ip.damageType]).toEqual([4, 10, "piercing"]);
    expect([ip.saveAbility, ip.saveEffect, ip.upcastDicePerLevel]).toEqual(["constitution", "half", 1]);
    expect(get("Aura of Life").classes).toEqual(["paladin"]);
    expect(get("Aid").effectKind).toBeUndefined(); // flat +5 HP is inexpressible
  });
});

describe("global GrantedAbility name-uniqueness", () => {
  // All these sources upsert into GrantedAbility, whose business key is
  // (name, edition) — #1415 widened it from name alone precisely so a
  // same-name fork (Nature's Wrath, #1229) can exist without colliding. Keyed
  // the same way here as assertUniqueGrantedAbilityNames (guards.ts) itself —
  // a bare name-only key would misreport that legitimate fork as a
  // cross-source collision.
  it("no (name, edition) pair collides across maneuvers/shadow-arts/channel-divinity", () => {
    const keys = [
      ...MANEUVERS.map((m) => `${m.name}::${m.edition ?? "shared"}`),
      ...SHADOW_ARTS.map((s) => `${s.name}::${s.edition ?? "shared"}`),
      ...CHANNEL_DIVINITIES.map((c) => `${c.name}::${c.edition ?? "shared"}`),
    ];
    expect(
      duplicates(keys),
      "GrantedAbility (name, edition) collision across the seed sources",
    ).toEqual([]);
  });
});

describe("referential integrity", () => {
  it("every SUBCLASSES.className names a class in CLASSES", () => {
    const classNames = new Set(CLASSES.map((c) => c.name));
    const dangling = SUBCLASSES.filter((s) => !classNames.has(s.className)).map((s) => s.className);
    expect([...new Set(dangling)], "subclass on unknown class").toEqual([]);
  });

  it("every PACKS content itemName exists in the ITEMS catalog", () => {
    const itemNames = new Set(ITEMS.map((i) => i.name));
    const dangling = PACKS.flatMap((p) => p.contents)
      .map((c) => c.itemName)
      .filter((name) => !itemNames.has(name));
    expect([...new Set(dangling)], "pack references an item missing from ITEMS").toEqual([]);
  });

  // Cross-source (#1128, briefly rescoped by #1308, restored by #1291): the
  // class-definition grantLevel table (registry.ts isSubclassActive) and
  // CLASSES.subclassLevel (the catalog column) are BOTH 2014-scoped now —
  // isSubclassActive resolves grantLevel through subclassActiveAt, the exact
  // gate buildClassesView resolves subclassLevel through, so the two values
  // must mean the same PHB'14 level and can go back to direct equality (the
  // ORIGINAL #1128 contract, before #1308 had to loosen it to a 2024-resolved
  // comparison while only the catalog column carried 2014 values).
  it("every class-definition grantLevel matches its seed subclassLevel", () => {
    const defByName: Record<string, ClassDefinition> = {
      Bard: bard, Cleric: cleric, Druid: druid,
      Monk: monk, Paladin: paladin, Ranger: ranger, Sorcerer: sorcerer,
      Warlock: warlock, Wizard: wizard,
    };
    const drift = CLASSES.flatMap((seedClass) =>
      Object.entries(defByName[seedClass.name]?.subclasses ?? {})
        .filter(([, sub]) => (sub.grantLevel ?? 3) !== seedClass.subclassLevel)
        .map(([key]) => `${seedClass.name}/${key}`),
    );
    expect(drift, "class-definition grantLevel differs from seed subclassLevel").toEqual([]);
  });

  // Fighter left `defByName` above when lib/classes/fighter.ts was deleted
  // (#1532); Barbarian left it the same way when lib/classes/barbarian.ts was
  // (#1223); Rogue left it the same way when lib/classes/rogue.ts was (#1231)
  // — all three classes' subclasses (Fighter: Champion/Battle Master/
  // Eldritch Knight; Barbarian: Totem Warrior/Berserker; Rogue: Arcane
  // Trickster/Assassin/Thief) are SUBCLASS_IDENTITY-only now, so there is no
  // `sub.grantLevel` left to compare against. Assert directly on the seeded
  // CharacterClass.subclassLevel value instead: SRD 5.2 grants every
  // subclass at level 3, and PHB'14 grants Martial Archetype (p.72) and
  // Primal Path (p.48) at 3rd level too (Roguish Archetype is also 3rd level
  // in PHB'14, unchanged by this migration and already the pre-existing
  // seeded value — page not re-verified for this issue), so 3 is correct in
  // BOTH editions — these rows are edition-invariant.
  it("Fighter's, Barbarian's and Rogue's seeded subclassLevel is 3 in both editions (SRD 5.2; PHB'14 pp. 72/48 verified, Rogue's own page not re-verified)", () => {
    const fighterClass = CLASSES.find((c) => c.name === "Fighter");
    const barbarianClass = CLASSES.find((c) => c.name === "Barbarian");
    const rogueClass = CLASSES.find((c) => c.name === "Rogue");
    expect(fighterClass?.subclassLevel).toBe(3);
    expect(barbarianClass?.subclassLevel).toBe(3);
    expect(rogueClass?.subclassLevel).toBe(3);
  });

  // Unlike the grantLevel drift test above (reverted to direct equality by
  // #1291, now that both tables are 2014-scoped), THIS check stays resolved
  // through subclassGateLevel: these gateLevel values are content authored
  // per the row's OWN admitted edition(s) (#1128, #901) — e.g. Life Domain's
  // earliest tier is authored as gateLevel 3 because 2024 doesn't grant the
  // subclass before level 3, so its two 2014 tiers (1st/3rd) collapsed into
  // one. Comparing against the raw (now 2014-scoped) subclassLevel column
  // would wrongly flag every such row. A row TAGGED EDITION_2014 (#901's
  // Illusion Minor Illusion grant, gateLevel 2) is only ever served to a 2014
  // character, so it's checked against subclassGateLevel(..., EDITION_2014)
  // instead — the 2024-resolved gate would wrongly flag legitimate PHB'14
  // content that gates earlier than 2024's uniform L3. A shared (untagged)
  // row is served to BOTH editions, so it's checked against the STRICTER
  // 2024-resolved gate (subclassGateLevel(..., EDITION_2024) is never lower
  // than the 2014-resolved gate for any class, #1308), which also proves it
  // clears the 2014 gate. A row whose className has no CLASSES entry (a typo)
  // is flagged directly, in its OWN accumulator so the failure message names
  // the right category instead of "gated below its own admitted edition's
  // resolved subclass gate" — Map.get's `undefined` would otherwise reach
  // subclassGateLevel, which resolves undefined to the constant 3 for EITHER
  // edition (the 2024 branch ignores its first arg; the 2014 branch's `?? 3`
  // does the same), so a typo'd row with gateLevel >= 3 would pass unchecked,
  // the same gap the old `?? 0` fallback had.
  it("every SUBCLASS_GRANTED_SPELLS gateLevel is at least its own admitted edition's resolved subclass gate", () => {
    const subclassLevelByClassName = new Map(CLASSES.map((c) => [c.name, c.subclassLevel]));
    const unknownClass: string[] = [];
    const early: string[] = [];
    for (const row of SUBCLASS_GRANTED_SPELLS) {
      const subclassLevel = subclassLevelByClassName.get(row.className);
      if (subclassLevel === undefined) {
        unknownClass.push(`${row.className}/${row.subclassName}/${row.spellName}`);
        continue;
      }
      const required = subclassGateLevel(subclassLevel, row.edition ?? "EDITION_2024");
      if (row.gateLevel < required) early.push(`${row.className}/${row.subclassName}/${row.spellName}@${row.gateLevel}`);
    }
    expect(unknownClass, "granted spell's className has no CLASSES entry").toEqual([]);
    expect(early, "granted spell gated below its own admitted edition's resolved subclass gate").toEqual([]);
  });
});

// #1277: SUBCLASS_SLUGS is the closed vocabulary joining a seeded Subclass row
// to its lib/classes/*.ts SubclassDefinition, replacing the substring match
// #1339 fixed on one of the seven gate sites. F2 measured the seed catalog and
// the class definitions as ALREADY a perfect 1:1 bijection (31 rows, 31
// definition keys) at the time of filing — each assertion below is a
// toEqual([]) diff so a broken row names the offender instead of a boolean
// pass/fail. #1532 deleted lib/classes/fighter.ts, #1223 deleted
// lib/classes/barbarian.ts, and #1231 deleted lib/classes/rogue.ts, so that
// bijection is now 31 rows / 23 definition keys: Fighter's three subclasses,
// Barbarian's two, and Rogue's three are SUBCLASS_IDENTITY-only (no
// SubclassDefinition), which is exactly the row-migrated case the fourth
// test below carves out.
describe("SUBCLASS_SLUGS — three-way bijection (#1277)", () => {
  const CLASS_DEFS: Record<string, ClassDefinition> = {
    bard, cleric, druid, monk, paladin, ranger, sorcerer, warlock, wizard,
  };

  // The named twin of scripts/check-class-ts-migration.sh's NOT_YET_MIGRATED
  // list, keyed by SUBCLASS_IDENTITY's classKey (not the seeded display
  // name) — a class that migrates off lib/classes/<class>.ts drops out of
  // BOTH lists in the same PR, or this test and the guard script silently
  // drift apart. Deliberate-coupling latch: if you change one, update the
  // other.
  const ROW_MIGRATED_CLASSES = ["fighter", "barbarian", "rogue"];

  // #1676: wizard-bladesinging is the FIRST real INTENTIONAL_GAPS entry.
  // Wizard is NOT a row-migrated class in ROW_MIGRATED_CLASSES' sense —
  // lib/classes/wizard.ts survives (it carries the class's residual subclass
  // grantLevel, class-features.ts's own header) and its three OTHER
  // subclasses each still have a real SubclassDefinition. Bladesinging is
  // identity-only by design (CLAUDE.md: a pure identity/join key carries no
  // rules text) — its mechanics ride the F1-F5 engine's seed-row vocabulary
  // entirely (wizard-features.ts's BLADESINGING_RAW), never a
  // SubclassDefinition, mirroring Fighter's own subclasses' shape without
  // Fighter's whole-module deletion. Declared here, with a reason, rather
  // than silently dropped from the bijection check below.
  const INTENTIONAL_GAPS: SubclassSlug[] = ["wizard-bladesinging"];

  it("every SUBCLASSES row's slug is a member of SUBCLASS_SLUGS and maps back to its own (className, name)", () => {
    const bad = SUBCLASSES.filter((s) => {
      const identity = SUBCLASS_IDENTITY[s.slug];
      if (!identity) return true;
      return identity.classKey !== s.className.toLowerCase() || identity.nameKey !== s.name.toLowerCase();
    }).map((s) => `${s.className}/${s.name} -> ${s.slug}`);
    expect(bad, "seed row's slug doesn't resolve back to its own (className, name)").toEqual([]);
  });

  it("every SUBCLASS_SLUGS member is seeded exactly once", () => {
    const seededSlugs = SUBCLASSES.map((s) => s.slug);
    const missing = SUBCLASS_SLUGS.filter((slug) => !seededSlugs.includes(slug));
    const dupes = duplicates(seededSlugs);
    expect(missing, "slug declared but never seeded").toEqual([]);
    expect(dupes, "slug seeded more than once").toEqual([]);
  });

  it("every SubclassDefinition's slug is a member of SUBCLASS_SLUGS and matches its own (classKey, nameKey)", () => {
    const bad: string[] = [];
    for (const [classKey, def] of Object.entries(CLASS_DEFS)) {
      for (const [nameKey, sub] of Object.entries(def.subclasses ?? {})) {
        const identity = SUBCLASS_IDENTITY[sub.slug];
        if (!identity || identity.classKey !== classKey || identity.nameKey !== nameKey) {
          bad.push(`${classKey}/${nameKey} -> ${sub.slug}`);
        }
      }
    }
    expect(bad, "SubclassDefinition's slug doesn't resolve back to its own (classKey, nameKey)").toEqual([]);
  });

  it("every SUBCLASS_SLUGS member has a matching SubclassDefinition, or belongs to a row-migrated class", () => {
    const definedSlugs = new Set<SubclassSlug>();
    for (const def of Object.values(CLASS_DEFS)) {
      for (const sub of Object.values(def.subclasses ?? {})) definedSlugs.add(sub.slug);
    }
    const missing = SUBCLASS_SLUGS.filter((slug) => {
      if (definedSlugs.has(slug)) return false;
      if (INTENTIONAL_GAPS.includes(slug)) return false;
      const identity = SUBCLASS_IDENTITY[slug];
      return !identity || !ROW_MIGRATED_CLASSES.includes(identity.classKey);
    });
    expect(missing, "slug declared but no SubclassDefinition carries it, and not a row-migrated class").toEqual([]);
  });

  // The declared intentional-gap allowlist — every entry here is a slug the
  // bijection check above deliberately excuses from needing a
  // SubclassDefinition, with its own reason recorded at the declaration site
  // (never silently dropped from SUBCLASS_SLUGS itself).
  it("the intentional-gap allowlist names exactly the disclosed engine-first subclasses", () => {
    expect(INTENTIONAL_GAPS).toEqual(["wizard-bladesinging"]);
  });
});
