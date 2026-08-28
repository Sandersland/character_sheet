import { describe, it, expect } from "vitest";

import { druid } from "@/lib/classes/druid.js";
import { monk } from "@/lib/classes/monk.js";
import { ranger } from "@/lib/classes/ranger.js";
import type { ClassDefinition } from "@/lib/classes/types.js";

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
import { CLASS_FEATURES } from "../class-features.js";

const duplicates = <T>(values: T[]): T[] =>
  [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];

describe("SUBCLASS_GRANTED_SPELLS — referential integrity", () => {
  // #1247: a seeded spell with no grant row never reaches the sheet.
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

  // Untagged, a grant would leak across editions.
  it("every Monk grant is tagged its subclass's own edition (#1625, #1502)", () => {
    const monkGrants = SUBCLASS_GRANTED_SPELLS.filter((g) => g.className === "Monk");
    expect(monkGrants.map((g) => `${g.subclassName}::${g.spellName}::${g.edition}`).sort()).toEqual([
      "Warrior of Shadow::Minor Illusion::EDITION_2024",
      "Warrior of the Elements::Elementalism::EDITION_2024",
      "Way of Shadow::Minor Illusion::EDITION_2014",
    ]);
  });

  // The DB unique constraint admits a shared (NULL) row alongside a tagged
  // twin for the same (subclass, spell), which would serve both to one
  // character — forbidden here at authoring time instead.
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

  // PHB'14: each 2014 patron's ten-spell "Expanded Spell List".
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

  // 2014's list-expansion and 2024's always-prepared Fiend Spells are
  // different mechanisms over overlapping-but-not-identical lists — a spell
  // present in both must resolve through exactly one mechanism per character.
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

// subclassGateLevel ignores CLASSES.subclassLevel entirely under 2024, so a
// reseed that "cleans up" these to a uniform 3 would silently regress every
// 2014 campaign's subclass timing.
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
  // Keyed on (key, edition) rather than key alone: a universal action repeats its key once per edition.
  it("ACTIONS have unique (key, edition) pairs", () => {
    expect(duplicates(ACTIONS.map((a) => `${a.key}::${a.edition ?? "shared"}`))).toEqual([]);
  });

  // No universal row may stay edition-NULL: resolveEditionCatalog would then
  // fall back to it for both editions and the fork would be invisible.
  // metamagic/divineSense/layOnHands are the sanctioned class-row exceptions
  // — their description text differs per edition even though the real gate
  // is DERIVED_ACTIONS' own fork, not this catalog row.
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

  // A re-costing row references a universal action by KEY; a key with no
  // counterpart in one edition would render an empty grant for that edition's
  // characters. `regrants` means "take this action for my cost instead of its
  // own", only meaningful if the universal row still costs an action.
  it("every regranted universal key (DERIVED_ACTIONS + CLASS_FEATURES rows) is a universal, action-cost row in BOTH editions (#1431)", () => {
    const rowRegrantedKeys = new Set(CLASS_FEATURES.flatMap((r) => r.regrants ?? []));
    const allRegrantedKeys = new Set([...REGRANTED_UNIVERSAL_KEYS, ...rowRegrantedKeys]);
    expect(allRegrantedKeys.size).toBeGreaterThan(0);
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      for (const key of allRegrantedKeys) {
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

  // A name may legitimately repeat once per edition (#1415/#1502) — only a
  // same-name/same-edition pair collapses in the DB's (name, edition) upsert.
  it("SHADOW_ARTS have unique (name, edition) pairs", () => {
    expect(duplicates(SHADOW_ARTS.map((s) => `${s.name}::${s.edition}`))).toEqual([]);
  });

  it("CHANNEL_DIVINITIES have unique (name, edition) pairs", () => {
    expect(duplicates(CHANNEL_DIVINITIES.map((c) => `${c.name}::${c.edition ?? "shared"}`))).toEqual([]);
  });

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

  // Scoped to EDITION_2024: PHB'14 p.165 has no per-feat level gate (#1310).
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

  // Great Weapon Fighting stays descriptive — its reroll is not automated.
  it("Fighting Style feats carry their derived improvements", () => {
    const byName = new Map(FEATS.map((f) => [f.name, f]));
    expect(byName.get("Archery")?.improvements).toEqual([{ target: "rangedAttackRoll", amount: 2 }]);
    expect(byName.get("Defense")?.improvements).toEqual([{ target: "armorClassWhileArmored", amount: 1 }]);
    expect(byName.get("Two-Weapon Fighting")?.improvements).toEqual([
      { target: "offhandAbilityDamage", amount: 1 },
    ]);
    expect(byName.get("Great Weapon Fighting")?.improvements ?? []).toEqual([]);
  });

  it("Alert AND Grappler both fork by edition (SRD 5.2 vs PHB'14 p.165; SRD 5.2 vs SRD 5.1)", () => {
    const alerts = FEATS.filter((f) => f.name === "Alert");
    expect(alerts).toHaveLength(2);
    expect(alerts.map((f) => f.edition).sort()).toEqual(["EDITION_2014", "EDITION_2024"]);
    const alert2014 = alerts.find((f) => f.edition === "EDITION_2014")!;
    const alert2024 = alerts.find((f) => f.edition === "EDITION_2024")!;
    expect(alert2014.improvements).toEqual([{ target: "initiative", amount: 5 }]);
    expect(alert2024.improvements).toEqual([{ target: "initiative", amount: 1, scaling: "proficiencyBonus" }]);
    // PHB'14 has no Origin taxonomy — the 2014 row is "general" and takes an
    // ASI slot (#1310).
    expect(alert2014.category).toBe("general");
    expect(alert2024.category).toBe("origin");

    const grapplers = FEATS.filter((f) => f.name === "Grappler");
    expect(grapplers).toHaveLength(2);
    expect(grapplers.map((f) => f.edition).sort()).toEqual(["EDITION_2014", "EDITION_2024"]);
    const grappler2014 = grapplers.find((f) => f.edition === "EDITION_2014")!;
    const grappler2024 = grapplers.find((f) => f.edition === "EDITION_2024")!;
    expect(grappler2014.abilityIncrease).toBeUndefined();
    expect(grappler2014.prerequisite).toBe("Strength 13+");
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

// PHB'14 p. 72 (Fighter) / p. 82 (Paladin) / p. 91 (Ranger), = SRD 5.1: six
// 2014 styles; SRD 5.2 has four (Dueling and Protection have no 2024
// counterpart). Per-class option gating is #1495, not seeded here.
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

// PHB'14 pp. 165-170: no Origin/Fighting Style/Epic Boon taxonomy, so every
// 2014 row is "general" with no levelPrerequisite — featOfferedForAsiSlot's
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

  // buildOriginEntry resolves originFeatName per edition and returns null on
  // a miss — a gap here silently drops a background's Origin feat grant.
  it("every BACKGROUNDS originFeatName has both an EDITION_2014 and EDITION_2024 row", () => {
    const originFeatNames = [...new Set(BACKGROUNDS.map((b) => b.originFeatName).filter((n): n is string => !!n))];
    expect(originFeatNames.length).toBeGreaterThan(0);
    for (const name of originFeatNames) {
      const editions = FEATS.filter((f) => f.name === name).map((f) => f.edition).sort();
      expect(editions, name).toEqual(["EDITION_2014", "EDITION_2024"]);
    }
  });
});

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
  // GrantedAbility's business key is (name, edition) (#1415) — a name-only
  // key would misreport a legitimate same-name edition fork as a collision.
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

  // Both the class-definition grantLevel table and CLASSES.subclassLevel are
  // 2014-scoped, so the two values must mean the same PHB'14 level.
  it("every class-definition grantLevel matches its seed subclassLevel", () => {
    const defByName: Record<string, ClassDefinition> = {
      Druid: druid,
      Monk: monk, Ranger: ranger,
    };
    const drift = CLASSES.flatMap((seedClass) =>
      Object.entries(defByName[seedClass.name]?.subclasses ?? {})
        .filter(([, sub]) => (sub.grantLevel ?? 3) !== seedClass.subclassLevel)
        .map(([key]) => `${seedClass.name}/${key}`),
    );
    expect(drift, "class-definition grantLevel differs from seed subclassLevel").toEqual([]);
  });

  // Fighter/Barbarian/Rogue have no TS module left — no sub.grantLevel to
  // compare against, so assert the seeded subclassLevel directly.
  it("Fighter's, Barbarian's and Rogue's seeded subclassLevel is 3 in both editions (SRD 5.2; PHB'14 pp. 72/48 verified, Rogue's own page not re-verified)", () => {
    const fighterClass = CLASSES.find((c) => c.name === "Fighter");
    const barbarianClass = CLASSES.find((c) => c.name === "Barbarian");
    const rogueClass = CLASSES.find((c) => c.name === "Rogue");
    expect(fighterClass?.subclassLevel).toBe(3);
    expect(barbarianClass?.subclassLevel).toBe(3);
    expect(rogueClass?.subclassLevel).toBe(3);
  });

  it("Cleric's, Warlock's and Wizard's seeded subclassLevel is their PHB'14 gate (#1576)", () => {
    const clericClass = CLASSES.find((c) => c.name === "Cleric");
    const warlockClass = CLASSES.find((c) => c.name === "Warlock");
    const wizardClass = CLASSES.find((c) => c.name === "Wizard");
    expect(clericClass?.subclassLevel).toBe(1); // PHB'14 p.57
    expect(warlockClass?.subclassLevel).toBe(1); // PHB'14 p.105
    expect(wizardClass?.subclassLevel).toBe(2); // PHB'14 p.114
  });

  // A typo'd className is flagged separately: Map.get's undefined would
  // otherwise reach subclassGateLevel's `?? 3` default and pass unchecked.
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

describe("SUBCLASS_SLUGS — three-way bijection (#1277)", () => {
  const CLASS_DEFS: Record<string, ClassDefinition> = {
    druid, monk, ranger,
  };

  // The named twin of the class-migration guard's NOT_YET_MIGRATED list,
  // keyed by SUBCLASS_IDENTITY's classKey. Deliberate-coupling latch: if you
  // change one, update the other.
  const ROW_MIGRATED_CLASSES = ["fighter", "barbarian", "rogue", "cleric", "warlock", "wizard", "sorcerer", "bard", "paladin"];

  // Empty on purpose — the allowlist for an engine-first subclass in a class
  // that keeps its module, with its reason recorded.
  const INTENTIONAL_GAPS: SubclassSlug[] = [];

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
});
