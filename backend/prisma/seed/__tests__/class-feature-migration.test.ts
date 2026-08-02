// DB-backed migration-correctness suite for #1522/#1523: ClassFeature is a
// mechanical move of DerivedFeature[] text out of twelve lib/classes/*.ts
// modules into seeded rows — no rules content changes, no reader wired up yet
// (#1524). Modelled on granted-ability-fork-reseed.test.ts: seed-class-
// features.ts exports seedClassFeatures(prisma) precisely so this file can
// call it in-process (seed.ts's OWN families can't be re-run this way —
// main() self-invokes at module load and exports nothing).
//
// The template DB vitest.global-setup.ts clones from already ran `prisma db
// seed` once, so every row asserted against below is the REAL seeded catalog,
// not a fixture — this suite is a positive control on that real seed, the
// same shape validate.test.ts uses for assertSeedContentValid.
import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { castSpecFromRow } from "@/lib/classes/actions.js";
import type { ClassFeatureRow } from "@/lib/classes/class-feature-rows.js";

import { CLASS_FEATURES, LITERAL_ROW_CLASSES } from "../class-features.js";
import { seedClassFeatures } from "../seed-class-features.js";
import { RESEED_TIMEOUT_MS } from "./reseed-timeout.js";

describe("ClassFeature migration — row count (#1523)", () => {
  it("the seeded table holds exactly the row count CLASS_FEATURES derives from the registry", async () => {
    // CLASS_FEATURES itself is not a literal — it's built at import time by
    // walking all twelve lib/classes/*.ts modules (class-features.ts), so
    // asserting the DB count against CLASS_FEATURES.length compares two
    // genuinely independent numbers (a live Postgres COUNT vs. a static-source
    // derivation), never a hardcoded 522.
    const actual = await prisma.classFeature.count();
    expect(actual).toBe(CLASS_FEATURES.length);
  });

  // Mutation proof (manual, recorded in the PR): deleting one real DB row
  // (e.g. Fighter's base-class "Indomitable" 2024 row) drops `actual` by 1
  // while CLASS_FEATURES.length is unaffected (it's derived from TS source,
  // not the DB) — this assertion is what goes red and by how much.
  it("every (class, subclass, name, edition) CLASS_FEATURES declares exists in the table — names the first missing tuple", async () => {
    const dbKeys = new Set(
      (
        await prisma.classFeature.findMany({
          select: { name: true, level: true, edition: true, classId: true, subclassId: true, class: { select: { name: true } }, subclass: { select: { slug: true } } },
        })
      ).map((r) => `${r.class.name}::${r.subclass?.slug ?? "null"}::${r.name}::${r.edition}`),
    );

    const missing: string[] = [];
    for (const row of CLASS_FEATURES) {
      const key = `${row.className}::${row.subclassSlug ?? "null"}::${row.name}::${row.edition}`;
      if (!dbKeys.has(key)) missing.push(key);
    }
    expect(missing, `missing ClassFeature row(s): ${missing.join(", ")}`).toEqual([]);
  });
});

// The derived half now has ZERO pre-forked names: Cleric's "Domain Spells"
// (#1225) was the last one, following Warlock's "Expanded Spell List"
// (#1233) off this path onto its own literal seed data
// (cleric-features.ts/warlock-features.ts) — both classes are now
// LITERAL_ROW_CLASSES members, so their rows never reach this test's loop at
// all (excluded by the `LITERAL_ROW_CLASSES.has(row.className)` `continue`
// below). By construction every remaining (className, subclassSlug, name,
// level) group of exactly 2 rows in CLASS_FEATURES must be an untagged
// feature's 2014/2024 expansion, so its two descriptions must be equal — this
// needs no separate access to the raw, pre-expansion feature list (which
// class-features.ts keeps internal).

// This suite reads in-memory CLASS_FEATURES, not the DB — both editions of an
// untagged row come from the SAME expandFeatureRow spread (class-features.ts),
// so this can only ever pass: it cannot catch a future author writing
// divergent 2014/2024 text for what should be one untagged feature, because
// by the time such a row reached CLASS_FEATURES it would already be two rows
// with two `feature.edition` tags, i.e. no longer "untagged" by this test's
// own KNOWN_FORKED_NAMES exclusion. What it DOES guard is expandFeatureRow
// itself: a future edit that made the untagged branch build two DIFFERENT
// descriptions (e.g. a copy-paste that varies `edition` into the text) fails
// here without needing a DB round-trip. The AC this migration actually cares
// about — that the DB holds what CLASS_FEATURES says — is covered
// transitively by the exhaustive DB<->TS description-equality suite above and
// the tuple-existence suite before it.
//
// SCOPED TO THE DERIVED HALF ONLY (#1227): LITERAL_ROW_CLASSES' rows
// (Fighter's, fighter-features.ts) never pass through expandFeatureRow at
// all — they arrive in CLASS_FEATURES already split one-row-per-edition, by
// hand, and several same-name/same-level pairs (Second Wind, Action Surge,
// Indomitable, Improved Critical, ...) are DELIBERATELY divergent text — this
// suite guards expandFeatureRow, not each LITERAL class's authored content.
// Excluding LITERAL_ROW_CLASSES rows here is the correct fix, not a second
// name-keyed allow-list (KNOWN_FORKED_NAMES, deleted #1225 — Cleric's
// "Domain Spells" was its last member).
describe("ClassFeature migration — expandFeatureRow's untagged branch keeps both editions byte-identical (#1523)", () => {
  it("every untagged feature's EDITION_2014/EDITION_2024 pair has equal level and description", async () => {
    const byKey = new Map<string, typeof CLASS_FEATURES>();
    for (const row of CLASS_FEATURES) {
      if (LITERAL_ROW_CLASSES.has(row.className)) continue;
      const key = `${row.className}::${row.subclassSlug ?? "null"}::${row.name}::${row.level}`;
      const group = byKey.get(key) ?? [];
      group.push(row);
      byKey.set(key, group);
    }

    const pairs = [...byKey.values()].filter((g) => g.length === 2);
    expect(pairs.length).toBeGreaterThan(0);

    for (const pair of pairs) {
      const editions = pair.map((r) => r.edition).sort();
      expect(editions).toEqual(["EDITION_2014", "EDITION_2024"]);
      expect(pair[0].description).toBe(pair[1].description);
    }
  });
});

describe("ClassFeature migration — the 2 already-forked pairs were not duplicated (#1523)", () => {
  it("Cleric Domain Spells: exactly one row per (subclass, edition), descriptions differ between editions", async () => {
    const rows = await prisma.classFeature.findMany({
      where: { name: "Domain Spells", class: { name: "Cleric" } },
      select: { level: true, edition: true, description: true, subclass: { select: { name: true } } },
    });
    expect(rows).toHaveLength(4); // Life Domain + Trickery Domain, x2 editions each

    for (const subclassName of ["Life Domain", "Trickery Domain"]) {
      const pair = rows.filter((r) => r.subclass?.name === subclassName);
      expect(pair).toHaveLength(1 * 2);
      expect(pair.every((r) => r.level === 1)).toBe(true);
      const [r2014, r2024] = [pair.find((r) => r.edition === "EDITION_2014"), pair.find((r) => r.edition === "EDITION_2024")];
      expect(r2014).toBeDefined();
      expect(r2024).toBeDefined();
      expect(r2014!.description).not.toBe(r2024!.description);
    }
  });

  // #1233: Warlock's "Expanded Spell List" is NO LONGER a forked pair — The
  // Fiend's 2024 row renamed to "Fiend Spells" (a different name, so
  // pruneStalePartitions retired the old 2024 "Expanded Spell List" DB row
  // outright) and The Archfey/The Great Old One are now EDITION_2014-only
  // (owner decision: their PHB'24 reworks are non-SRD, so zero 2024 rows are
  // authored). Every "Expanded Spell List" row left is a single EDITION_2014
  // row per patron — asserted here as exactly that, not a fork.
  it("Warlock Expanded Spell List: exactly one EDITION_2014 row per patron, no EDITION_2024 row anywhere", async () => {
    const rows = await prisma.classFeature.findMany({
      where: { name: "Expanded Spell List", class: { name: "Warlock" } },
      select: { level: true, edition: true, description: true, subclass: { select: { name: true } } },
    });
    expect(rows).toHaveLength(3); // The Fiend + The Archfey + The Great Old One, EDITION_2014 only

    for (const subclassName of ["The Fiend", "The Archfey", "The Great Old One"]) {
      const pair = rows.filter((r) => r.subclass?.name === subclassName);
      expect(pair).toHaveLength(1);
      expect(pair[0].level).toBe(1);
      expect(pair[0].edition).toBe("EDITION_2014");
    }
  });
});

// Second Wind/Action Surge/Indomitable (base Fighter, both editions — 6 rows)
// are the FIRST descriptor columns populated (#1528, the ClassFeature pilot):
// resourceKey/resourceTotals/resourceRecharge for all three, plus
// activation/cost/effect columns for the two that are selectable actions
// (Indomitable never was — see fighter-features.ts's own comment). Every
// OTHER row — including every OTHER Fighter row — stays NULL/default until
// its own wave-2 retab (#1134).
const POPULATED_ROW_NAMES = new Set(["Second Wind", "Action Surge", "Indomitable"]);

function isPopulatedFighterRow(row: { className: string; subclassSlug: string | null; name: string }): boolean {
  return row.className === "Fighter" && row.subclassSlug === null && POPULATED_ROW_NAMES.has(row.name);
}

// #1223: Rage's resource pool (base Barbarian, both editions — 2 rows) is the
// second class to populate a resource descriptor column after Fighter's #1528
// pilot. No activation/cost/effect columns — Rage's activation stays in
// classes/actions.ts's DERIVED_ACTIONS (this migration moves the pool only).
function isPopulatedBarbarianRow(row: { className: string; subclassSlug: string | null; name: string }): boolean {
  return row.className === "Barbarian" && row.subclassSlug === null && row.name === "Rage";
}

// #1234: Arcane Recovery's resource pool (base Wizard, both editions — 2
// rows) — the third class to populate a resource descriptor column. No
// activation/cost/effect columns (Arcane Recovery has no DERIVED_ACTIONS
// entry — it's spent through the spellcasting op, not the actions endpoint).
function isPopulatedWizardRow(row: { className: string; subclassSlug: string | null; name: string }): boolean {
  return row.className === "Wizard" && row.subclassSlug === null && row.name === "Arcane Recovery";
}

// #1234: Illusory Self's resource pool (School of Illusion subclass, both
// editions — 2 rows) — the one SUBCLASS-scoped Wizard resource row, mirroring
// Battle Master's Combat Superiority above. Same no-activation reasoning as
// isPopulatedWizardRow.
function isPopulatedIllusorySelfRow(row: { className: string; subclassSlug: string | null; name: string }): boolean {
  return row.className === "Wizard" && row.subclassSlug === "wizard-school-of-illusion" && row.name === "Illusory Self";
}

// #1546 Part B: Battle Master's Combat Superiority is the one SUBCLASS-scoped
// resource row (its superiority-dice pool) alongside the three base-class
// ones above.
function isPopulatedBattleMasterPoolRow(row: { className: string; subclassSlug: string | null; name: string }): boolean {
  return row.className === "Fighter" && row.subclassSlug === "fighter-battle-master" && row.name === "Combat Superiority";
}

// #1233: every Warlock pool that moved onto its row — Magical Cunning (base),
// Dark One's Own Luck/Hurl Through Hell (The Fiend), Fey Presence/Misty
// Escape/Dark Delirium (The Archfey), Entropic Ward (The Great Old One).
// Dark One's Own Luck's 2024 row sets resourceKey but deliberately OMITS
// resourceTotals (a Charisma-modifier formula, still resourceFn-derived) —
// still "populated" for this check's purposes, since resourceKey itself is
// non-null.
const POPULATED_WARLOCK_ROW_KEYS = new Set([
  "Warlock::null::Magical Cunning",
  "Warlock::warlock-the-fiend::Dark One's Own Luck",
  "Warlock::warlock-the-fiend::Hurl Through Hell",
  "Warlock::warlock-the-archfey::Fey Presence",
  "Warlock::warlock-the-archfey::Misty Escape",
  "Warlock::warlock-the-archfey::Dark Delirium",
  "Warlock::warlock-the-great-old-one::Entropic Ward",
]);

function isPopulatedWarlockRow(row: { className: string; subclassSlug: string | null; name: string }): boolean {
  return POPULATED_WARLOCK_ROW_KEYS.has(`${row.className}::${row.subclassSlug ?? "null"}::${row.name}`);
}

// #1230: Ranger's three Wisdom-tier-or-formula pools. Keyed on the 4-tuple
// INCLUDING edition (unlike POPULATED_WARLOCK_ROW_KEYS' 3-tuple) because
// Favored Enemy is the asymmetric case the RowKey comment below names: its
// 2014 row carries NO resourceKey at all, only its 2024 row does — a 3-tuple
// key would incorrectly mark the 2014 row "populated" too and fail its
// expectNullResourceColumns check. Tireless/Nature's Veil have no 2014
// counterpart at all, so their 2024-only keys need no such asymmetry
// handling, but stay 4-tuples for consistency. Tireless/Nature's Veil set
// resourceKey but deliberately OMIT resourceTotals (a Wisdom-modifier
// formula, still resourceFn-derived) — still "populated" for this check's
// purposes, same shape as Warlock's Dark One's Own Luck 2024 row.
const POPULATED_RANGER_ROW_KEYS = new Set([
  "Ranger::null::Favored Enemy::EDITION_2024",
  "Ranger::null::Tireless::EDITION_2024",
  "Ranger::null::Nature's Veil::EDITION_2024",
]);

function isPopulatedRangerRow(row: RowKey): boolean {
  return POPULATED_RANGER_ROW_KEYS.has(`${row.className}::${row.subclassSlug ?? "null"}::${row.name}::${row.edition}`);
}

// #1232: every Sorcerer pool that moved onto its row — Innate Sorcery/
// Sorcerous Restoration (base), Tides of Chaos (Wild Magic, BOTH editions —
// keyed with `edition` since the 2014 and 2024 rows are two DIFFERENT rows
// sharing one name), Dragon Wings (Draconic Bloodline)/Tamed Surge (Wild
// Magic). `sorceryPoints` stays in lib/classes/sorcerer.ts's resourceFn (a
// formula, not a tier table) so it is deliberately absent from this set.
const POPULATED_SORCERER_ROW_KEYS = new Set([
  "Sorcerer::null::Innate Sorcery::EDITION_2024",
  "Sorcerer::null::Sorcerous Restoration::EDITION_2024",
  "Sorcerer::sorcerer-wild-magic::Tides of Chaos::EDITION_2014",
  "Sorcerer::sorcerer-wild-magic::Tides of Chaos::EDITION_2024",
  "Sorcerer::sorcerer-draconic-bloodline::Dragon Wings::EDITION_2024",
  "Sorcerer::sorcerer-wild-magic::Tamed Surge::EDITION_2024",
]);

function isPopulatedSorcererRow(row: RowKey): boolean {
  return POPULATED_SORCERER_ROW_KEYS.has(`${row.className}::${row.subclassSlug ?? "null"}::${row.name}::${row.edition}`);
}

// What the descriptor predicates below key on. `edition` is part of the key
// because a class can populate a descriptor column on ONE edition's row and
// not the other's, under the same (class, subclass, name): Ranger's Favored
// Enemy exists in both editions and carries a pool only in 2024 (#1230), and
// Warlock's Dark One's Own Luck already omits resourceTotals on its 2024 row
// alone. A 3-tuple key cannot express either, and would assert the wrong thing
// on the row it can't distinguish. Predicates that are edition-invariant
// simply ignore the field.
type RowKey = { className: string; subclassSlug: string | null; name: string; edition: string };

// #1546 Part B: the ability list Combat Superiority's maneuverSaveDC is
// computed from — the one row that sets it, both editions.
function isSaveDcRow(row: RowKey): boolean {
  return isPopulatedBattleMasterPoolRow(row);
}

// The single "this row has a populated resource pool" predicate, called once by
// each check below rather than inlined as an OR chain — that chain is what
// pushed those checks' own cyclomatic/CRAP scores over the ratchet as wave 2
// added classes (prisma/seed/** carries no coverage instrumentation, so CRAP
// floors at CC^2+CC regardless of real coverage — see baseFeatureRows'
// comment, class-features.ts, for the same reasoning).
//
// #1233 and #1234 each introduced their own copy of this aggregator while
// developing in parallel (isPopulatedRow / isAnyPopulatedResourceRow); they
// were merged into this one at integration, because two aggregators each
// naming a DIFFERENT subset is precisely how a row silently escapes the
// descriptor sweep. Every new populated-row predicate goes here, once —
// wave b's isPopulatedRangerRow (#1230) and isPopulatedSorcererRow (#1232)
// included, both added to this SAME aggregator rather than sibling ones.
function isPopulatedRow(row: RowKey): boolean {
  return (
    isPopulatedFighterRow(row) ||
    isPopulatedBattleMasterPoolRow(row) ||
    isPopulatedBarbarianRow(row) ||
    isPopulatedWarlockRow(row) ||
    isPopulatedWizardRow(row) ||
    isPopulatedIllusorySelfRow(row) ||
    isPopulatedRangerRow(row) ||
    isPopulatedSorcererRow(row)
  );
}

// #1530: Extra Attack's derivedStat/derivedStatTiers columns are populated on
// six (class, subclass) pairs — the base-class row for Fighter/Barbarian/
// Monk/Paladin/Ranger, plus Bard's College of Valor subclass row (the only
// subclass-gated Extra Attack, #1277's slug join). Keyed by (className,
// subclassSlug, name) tuple, not by (className, name): Bard is the row that
// needs it — base Bard has no "Extra Attack" row at all, only College of
// Valor's subclass-tagged one, so subclassSlug is what lets this set name
// THAT row precisely instead of a bare className+name pair that would stop
// being unambiguous the moment any class gains a same-named row under both
// its base and a subclass. Two/Three Extra Attacks are a different name
// entirely and never need the tuple for that reason.
// #1546 Part B adds Fighter's Battle Master rows: Combat Superiority
// (maneuverChoiceCount) and Student of War (toolProfChoiceCount) — both
// subclass-scoped, keyed the same tuple way as Bard's College of Valor row.
const DERIVED_STAT_ROW_KEYS = new Set([
  "Fighter::null::Extra Attack",
  "Barbarian::null::Extra Attack",
  "Monk::null::Extra Attack",
  "Paladin::null::Extra Attack",
  "Ranger::null::Extra Attack",
  "Bard::bard-college-of-valor::Extra Attack",
  "Fighter::fighter-battle-master::Combat Superiority",
  "Fighter::fighter-battle-master::Student of War",
]);

function isDerivedStatRow(row: RowKey): boolean {
  return DERIVED_STAT_ROW_KEYS.has(`${row.className}::${row.subclassSlug ?? "null"}::${row.name}`);
}

type DescriptorRow = {
  name: string;
  resourceKey: string | null;
  resourceLabel: string | null;
  resourceRecharge: string | null;
  resourceTotals: unknown;
  resourceDieTiers: unknown;
  activationCost: string | null;
  resolverKind: string | null;
  requiresUnarmored: boolean;
  regrants: string[];
  costKind: string | null;
  costPoolKey: string | null;
  costBase: number | null;
  costPerStep: number | null;
  effectKind: string | null;
  effectDiceCount: number | null;
  effectDiceFaces: number | null;
  effectDieSource: string | null;
  effectModifier: number | null;
  effectModifierSource: string | null;
  damageType: string | null;
  attackType: string | null;
  saveAbility: string | null;
  saveEffect: string | null;
  buffTarget: string | null;
  buffModifier: number | null;
  derivedStat: string | null;
  derivedStatTiers: unknown;
  saveDcAbilities: string[];
};

// Every resource/activation/cost/effect column at its NULL/default reset —
// split out so the test body's own branching stays low (see
// isPopulatedRow's comment above for why).
function expectNullResourceColumns(row: DescriptorRow): void {
  expect(row.resourceKey, row.name).toBeNull();
  expect(row.resourceLabel, row.name).toBeNull();
  expect(row.resourceRecharge, row.name).toBeNull();
  expect(row.resourceTotals, row.name).toBeNull();
  expect(row.resourceDieTiers, row.name).toBeNull();
  expect(row.activationCost, row.name).toBeNull();
  expect(row.resolverKind, row.name).toBeNull();
  expect(row.requiresUnarmored, row.name).toBe(false);
  expect(row.regrants, row.name).toEqual([]);
  expect(row.costKind, row.name).toBeNull();
  expect(row.costPoolKey, row.name).toBeNull();
  expect(row.costBase, row.name).toBeNull();
  expect(row.costPerStep, row.name).toBeNull();
  expect(row.effectKind, row.name).toBeNull();
  expect(row.effectDiceCount, row.name).toBeNull();
  expect(row.effectDiceFaces, row.name).toBeNull();
  expect(row.effectDieSource, row.name).toBeNull();
  expect(row.effectModifier, row.name).toBeNull();
  expect(row.effectModifierSource, row.name).toBeNull();
  expect(row.damageType, row.name).toBeNull();
  expect(row.attackType, row.name).toBeNull();
  expect(row.saveAbility, row.name).toBeNull();
  expect(row.saveEffect, row.name).toBeNull();
  expect(row.buffTarget, row.name).toBeNull();
  expect(row.buffModifier, row.name).toBeNull();
}

// One row's full set of descriptor-column assertions — extracted so the it()
// body itself is a plain fetch + count + loop, not the branching (same
// complexity-budget reasoning as the two functions above).
function expectRowDescriptors(row: DescriptorRow & RowKey): void {
  const key = {
    className: row.className,
    subclassSlug: row.subclassSlug,
    name: row.name,
    edition: row.edition,
  };
  if (isPopulatedRow(key)) {
    // Populated by #1528/#1546/#1234 — asserted precisely in the describe
    // blocks below. Falls through to the derivedStat/saveDcAbilities checks
    // rather than an early return: Combat Superiority (#1546) sets a resource
    // pool AND a derivedStat AND saveDcAbilities all on the SAME row, so
    // returning here would skip asserting the latter two entirely.
    expect(row.resourceKey, row.name).not.toBeNull();
  } else {
    expectNullResourceColumns(row);
  }

  // #1530/#1546: Extra Attack's six pairs plus Combat Superiority/Student
  // of War are the derivedStat exceptions, checked separately since they
  // don't all touch the resource columns asserted null above.
  if (isDerivedStatRow(key)) {
    expect(row.derivedStat, row.name).not.toBeNull();
    expect(row.derivedStatTiers, row.name).not.toBeNull();
  } else {
    expect(row.derivedStat, row.name).toBeNull();
    expect(row.derivedStatTiers, row.name).toBeNull();
  }

  // #1546: saveDcAbilities defaults to `[]` (a NOT NULL String[] column,
  // same "no SQL NULL to distinguish" shape as `regrants`) — non-empty
  // only on Combat Superiority, both editions.
  if (isSaveDcRow(key)) {
    expect(row.saveDcAbilities, row.name).toEqual(["strength", "dexterity"]);
  } else {
    expect(row.saveDcAbilities, row.name).toEqual([]);
  }
}

describe("ClassFeature migration — every descriptor column is NULL/default, except Fighter's #1528 pilot rows and Barbarian's #1223 Rage rows", () => {
  it("no row has a populated descriptor column, except Second Wind/Action Surge/Indomitable (#1528), Rage (#1223), and Arcane Recovery/Illusory Self (#1234)", async () => {
    const rows = await prisma.classFeature.findMany({
      select: { name: true, edition: true, class: { select: { name: true } }, subclass: { select: { slug: true } },
        resourceKey: true, resourceLabel: true, resourceRecharge: true, resourceTotals: true, resourceDieTiers: true,
        activationCost: true, resolverKind: true, requiresUnarmored: true, regrants: true,
        costKind: true, costPoolKey: true, costBase: true, costPerStep: true,
        effectKind: true, effectDiceCount: true, effectDiceFaces: true, effectDieSource: true,
        effectModifier: true, effectModifierSource: true, damageType: true, attackType: true,
        saveAbility: true, saveEffect: true, buffTarget: true, buffModifier: true,
        derivedStat: true, derivedStatTiers: true, saveDcAbilities: true,
      },
    });
    // Pinned to the registry-derived count, not `> 0`: a row silently dropped
    // by the seeder (or left over from a previous test's partial write) would
    // still pass every per-row expectation below and read as "all clear".
    expect(rows.length).toBe(CLASS_FEATURES.length);

    for (const row of rows) {
      expectRowDescriptors({ ...row, className: row.class.name, subclassSlug: row.subclass?.slug ?? null });
    }
  });

  // Prisma deserializes BOTH SQL NULL (Prisma.DbNull) and a stored JSON `null`
  // (Prisma.JsonNull) to the JS value `null` — so the per-row `toBeNull()`
  // checks above pass identically whichever one is actually on disk and
  // cannot tell them apart. That gap is exactly what let seed-class-
  // features.ts write Prisma.JsonNull (a real, non-NULL JSON scalar) into
  // all three Json? descriptor columns while this suite stayed green. Assert
  // the SQL-level state directly for the three Json? columns so a future
  // regression to JsonNull goes red here instead of only showing up as a
  // `WHERE col IS NULL` filter silently matching zero rows four stages from
  // now (#1525's population guards). resourceTotals excludes #1528's six
  // populated Fighter rows (Second Wind ×2/Action Surge ×2/Indomitable ×2)
  // PLUS #1546's Combat Superiority ×2 (its superiority-dice pool) PLUS
  // #1223's Rage x2 (Barbarian's base-class pool, both editions) PLUS #1234's
  // Arcane Recovery x2 (Wizard's base-class pool) and Illusory Self x2 (School
  // of Illusion's subclass pool) PLUS #1233's eight Warlock rows that set
  // resourceTotals (Magical Cunning x1, Dark One's Own Luck 2014-only x1 — its
  // 2024 row deliberately OMITS resourceTotals, a Charisma-modifier formula —
  // Hurl Through Hell x2, Fey Presence x1, Misty Escape x1, Dark Delirium x1,
  // Entropic Ward x1) PLUS #1230's ONE Ranger row: Favored Enemy's 2024 row
  // only (its 2014 row carries no resourceKey at all; Tireless's/Nature's
  // Veil's 2024 rows set resourceKey but deliberately OMIT resourceTotals, a
  // Wisdom-modifier formula, same shape as Dark One's Own Luck's 2024 row)
  // PLUS #1232's six Sorcerer rows (Innate Sorcery x1, Sorcerous Restoration
  // x1, Tides of Chaos x2 — one per edition, both real rows sharing a name —
  // Dragon Wings x1, Tamed Surge x1);
  // derivedStatTiers excludes #1530's twelve populated Extra
  // Attack rows PLUS #1546's Combat Superiority/Student of War x2 editions each
  // (DERIVED_STAT_ROW_KEYS x2 editions each, computed below); resourceDieTiers
  // excludes only Combat Superiority x2 (the only row with a die-size tier).
  it("resourceTotals/resourceDieTiers/derivedStatTiers are SQL NULL (Prisma.DbNull), not a stored JSON null, everywhere they aren't authored", async () => {
    // This total is SUMMED across wave-b branches, never taken from one of
    // them: #1230 raised 22 -> 23 and #1232 raised 22 -> 28 independently, so
    // the merged value is 22 + 1 + 6. Picking either branch's number here
    // would silently exempt the other class's rows from the sweep — the wave-A
    // near-miss this file's aggregator comment already records, in its other
    // half.
    // 6 Fighter + 2 Combat Superiority + 2 Rage + 4 Wizard + 8 Warlock + 1 Ranger + 6 Sorcerer.
    const populatedResourceTotalsCount = 29;
    const populatedResourceDieTiersCount = 2;
    const populatedDerivedStatTiersCount = DERIVED_STAT_ROW_KEYS.size * 2;
    for (const column of ["resourceTotals", "resourceDieTiers", "derivedStatTiers"] as const) {
      const expectedDbNull =
        column === "resourceTotals"
          ? CLASS_FEATURES.length - populatedResourceTotalsCount
          : column === "derivedStatTiers"
            ? CLASS_FEATURES.length - populatedDerivedStatTiersCount
            : CLASS_FEATURES.length - populatedResourceDieTiersCount;
      const dbNullCount = await prisma.classFeature.count({ where: { [column]: { equals: Prisma.DbNull } } });
      expect(dbNullCount, column).toBe(expectedDbNull);

      const jsonNullCount = await prisma.classFeature.count({ where: { [column]: { equals: Prisma.JsonNull } } });
      expect(jsonNullCount, column).toBe(0);
    }
  });
});

// #1528: precise pin for the six populated rows — proves the pilot's write
// landed exactly as authored, not just "something is non-null" (the loose
// check above).
describe("ClassFeature migration — Fighter's #1528 pilot rows are populated exactly as authored", () => {
  it("Second Wind: resourceKey/recharge/totals + activation/cost/effect columns, per edition", async () => {
    const rows = await prisma.classFeature.findMany({
      where: { name: "Second Wind", class: { name: "Fighter" }, subclassId: null },
      orderBy: { edition: "asc" },
    });
    expect(rows).toHaveLength(2);
    const [row2014, row2024] = rows[0].edition === "EDITION_2014" ? [rows[0], rows[1]] : [rows[1], rows[0]];

    expect(row2014.resourceKey).toBe("secondWind");
    expect(row2014.resourceRecharge).toBe("short-or-long");
    expect(row2014.resourceTotals).toEqual([{ minLevel: 1, total: 1 }]);

    expect(row2024.resourceKey).toBe("secondWind");
    expect(row2024.resourceRecharge).toBe("longRest");
    expect(row2024.resourceTotals).toEqual([
      { minLevel: 1, total: 2, shortRestRegain: 1 },
      { minLevel: 4, total: 3, shortRestRegain: 1 },
      { minLevel: 10, total: 4, shortRestRegain: 1 },
    ]);

    for (const row of rows) {
      expect(row.activationCost, row.edition).toBe("bonusAction");
      expect(row.resolverKind, row.edition).toBe("heal-roll");
      expect(row.costKind, row.edition).toBe("pool");
      expect(row.costPoolKey, row.edition).toBe("secondWind");
      expect(row.costBase, row.edition).toBe(1);
      expect(row.effectKind, row.edition).toBe("heal");
      expect(row.effectDiceCount, row.edition).toBe(1);
      expect(row.effectDiceFaces, row.edition).toBe(10);
      expect(row.effectModifierSource, row.edition).toBe("classLevel");
    }
  });

  it("Action Surge: resourceKey/recharge/totals identical across both editions + activation/cost columns, no effect columns (pure counter)", async () => {
    const rows = await prisma.classFeature.findMany({
      where: { name: "Action Surge", class: { name: "Fighter" }, subclassId: null },
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.resourceKey, row.edition).toBe("actionSurge");
      expect(row.resourceRecharge, row.edition).toBe("short-or-long");
      expect(row.resourceTotals, row.edition).toEqual([
        { minLevel: 2, total: 1 },
        { minLevel: 17, total: 2 },
      ]);
      expect(row.activationCost, row.edition).toBe("special");
      expect(row.resolverKind, row.edition).toBe("simple-confirm");
      expect(row.costKind, row.edition).toBe("pool");
      expect(row.costPoolKey, row.edition).toBe("actionSurge");
      expect(row.costBase, row.edition).toBe(1);
      expect(row.effectKind, row.edition).toBeNull(); // no such axis — a pure counter
    }
  });

  it("Indomitable: resourceKey/recharge/totals only — no activation (never a selectable action)", async () => {
    const rows = await prisma.classFeature.findMany({
      where: { name: "Indomitable", class: { name: "Fighter" }, subclassId: null },
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.resourceKey, row.edition).toBe("indomitable");
      expect(row.resourceRecharge, row.edition).toBe("longRest");
      expect(row.resourceTotals, row.edition).toEqual([
        { minLevel: 9, total: 1 },
        { minLevel: 13, total: 2 },
        { minLevel: 17, total: 3 },
      ]);
      expect(row.activationCost, row.edition).toBeNull();
      expect(row.costKind, row.edition).toBeNull();
    }
  });
});

// #1223: precise pin for Rage's two populated rows, mirroring the Fighter
// pilot-row proofs above — proves the write landed exactly as authored, not
// just "something is non-null".
describe("ClassFeature migration — Barbarian's #1223 Rage rows are populated exactly as authored", () => {
  it("resourceKey/recharge/totals only — no activation/cost columns (Rage's activation stays in classes/actions.ts's DERIVED_ACTIONS)", async () => {
    const rows = await prisma.classFeature.findMany({
      where: { name: "Rage", class: { name: "Barbarian" }, subclassId: null },
      orderBy: { edition: "asc" },
    });
    expect(rows).toHaveLength(2);
    const [row2014, row2024] = rows[0].edition === "EDITION_2014" ? [rows[0], rows[1]] : [rows[1], rows[0]];

    expect(row2014.resourceKey).toBe("rage");
    expect(row2014.resourceRecharge).toBe("longRest");
    expect(row2014.resourceTotals).toEqual([
      { minLevel: 1, total: 2 },
      { minLevel: 3, total: 3 },
      { minLevel: 6, total: 4 },
      { minLevel: 12, total: 5 },
      { minLevel: 17, total: 6 },
      { minLevel: 20, total: 99 },
    ]);

    expect(row2024.resourceKey).toBe("rage");
    expect(row2024.resourceRecharge).toBe("longRest");
    expect(row2024.resourceTotals).toEqual([
      { minLevel: 1, total: 2, shortRestRegain: 1 },
      { minLevel: 3, total: 3, shortRestRegain: 1 },
      { minLevel: 6, total: 4, shortRestRegain: 1 },
      { minLevel: 12, total: 5, shortRestRegain: 1 },
      { minLevel: 17, total: 6, shortRestRegain: 1 },
    ]);

    for (const row of rows) {
      expect(row.activationCost, row.edition).toBeNull();
      expect(row.costKind, row.edition).toBeNull();
    }
  });
});

// #1234: precise pin for Wizard's two populated rows (Arcane Recovery,
// Illusory Self) — same reasoning as the Fighter/Barbarian pins above.
describe("ClassFeature migration — Wizard's #1234 Arcane Recovery / Illusory Self rows are populated exactly as authored", () => {
  it("Arcane Recovery: flat total 1, longRest, both editions — no activation/cost columns", async () => {
    const rows = await prisma.classFeature.findMany({
      where: { name: "Arcane Recovery", class: { name: "Wizard" }, subclassId: null },
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.resourceKey, row.edition).toBe("arcaneRecovery");
      expect(row.resourceRecharge, row.edition).toBe("longRest");
      expect(row.resourceTotals, row.edition).toEqual([{ minLevel: 1, total: 1 }]);
      expect(row.activationCost, row.edition).toBeNull();
      expect(row.costKind, row.edition).toBeNull();
    }
  });

  it("Illusory Self: flat total 1 from level 10, short-or-long, both editions", async () => {
    const rows = await prisma.classFeature.findMany({
      where: { name: "Illusory Self", subclass: { slug: "wizard-school-of-illusion" } },
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.resourceKey, row.edition).toBe("illusorySelf");
      expect(row.resourceRecharge, row.edition).toBe("short-or-long");
      expect(row.resourceTotals, row.edition).toEqual([{ minLevel: 10, total: 1 }]);
      expect(row.activationCost, row.edition).toBeNull();
      expect(row.costKind, row.edition).toBeNull();
    }
  });
});

describe("ClassFeature migration — every description is byte-identical to its TS source row (#1523)", () => {
  it("a sample of untagged and tagged rows match their CLASS_FEATURES source exactly", async () => {
    // Full-table exhaustive check (cheap at 522 rows) rather than a sample —
    // "byte-identical, no reflowing, no copy-editing" is the whole point.
    const dbRows = await prisma.classFeature.findMany({
      select: { name: true, level: true, description: true, edition: true, class: { select: { name: true } }, subclass: { select: { slug: true } } },
    });
    const dbByKey = new Map(
      dbRows.map((r) => [`${r.class.name}::${r.subclass?.slug ?? "null"}::${r.name}::${r.edition}`, r.description]),
    );

    for (const row of CLASS_FEATURES) {
      const key = `${row.className}::${row.subclassSlug ?? "null"}::${row.name}::${row.edition}`;
      expect(dbByKey.get(key), key).toBe(row.description);
    }
  });
});

describe("ClassFeature migration — seedClassFeatures is idempotent (#1523)", () => {
  it("running it again against an already-seeded table leaves the count unchanged and raises no P2002", async () => {
    const before = await prisma.classFeature.count();
    await expect(seedClassFeatures(prisma)).resolves.toBeUndefined();
    const after = await prisma.classFeature.count();
    expect(after).toBe(before);
  }, RESEED_TIMEOUT_MS);

  it("a changed source row's description/level updates the SAME row in place on reseed, never a sibling", async () => {
    const canonical = CLASS_FEATURES.find(
      (r) => r.className === "Fighter" && r.subclassSlug === null && r.name === "Second Wind" && r.edition === "EDITION_2024",
    );
    if (!canonical) throw new Error("fixture assumption broken: Fighter's base-class Second Wind (2024) row is missing from CLASS_FEATURES");

    const target = await prisma.classFeature.findFirstOrThrow({
      where: { name: "Second Wind", class: { name: "Fighter" }, subclassId: null, edition: "EDITION_2024" },
    });

    await prisma.classFeature.update({ where: { id: target.id }, data: { description: "TEMPORARILY MUTATED FOR TEST" } });

    await seedClassFeatures(prisma);

    const rows = await prisma.classFeature.findMany({
      where: { name: "Second Wind", class: { name: "Fighter" }, subclassId: null, edition: "EDITION_2024" },
    });
    // Same row updated in place — not a second row created alongside the
    // (never-deleted) mutated one.
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(target.id);
    expect(rows[0].description).toBe(canonical.description);
  }, RESEED_TIMEOUT_MS);
});

// #1528 EffectRow landmine pin: EffectRow's `level` decides the SCALING axis
// (cantrip/upcast), but a ClassFeature row's `level` is the CHARACTER level
// the feature is GRANTED at — a different number entirely. The
// `{ ...row, level: 0 }` adapter (castSpecFromRow, actions.ts) is what keeps
// `resolveEffectScaling` from reinterpreting a grant level as a spell level.
// Both tests below go THROUGH castSpecFromRow itself (the production call
// site), not a re-implementation of its `{ ...row, level: 0 }` adapter inline
// — a prior version of this test called readEffectSpec directly with the same
// adapter hand-copied in, which stayed green even with the adapter deleted
// from castSpecFromRow, because it was testing its own copy of the fix, not
// the fix.
describe("ClassFeature EffectRow landmine — no Fighter row ever resolves a non-'none' scaling mode (#1528)", () => {
  it("every REAL Fighter row with effectKind set resolves { mode: 'none' } through castSpecFromRow", async () => {
    const rows = await prisma.classFeature.findMany({
      where: { class: { name: "Fighter" }, effectKind: { not: null } },
    });
    // Second Wind (both editions) is the only Fighter row with effectKind set
    // today — asserting length keeps this pin honest as a real DB count, not
    // an early-return over an accidentally-empty result set. NOTE: this loop
    // alone is NOT mutation-proof against deleting the `level: 0` adapter —
    // ClassFeature has no cantripScaling/upcastDicePerLevel columns (schema.prisma's
    // own comment: must never gain them), so no REAL row can ever arm the
    // landmine and this loop stays green either way. The adversarial test
    // below is the one that actually exercises the adapter.
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      // Prisma types resourceTotals/resourceDieTiers as opaque JsonValue —
      // cast to ClassFeatureRow's concrete shape once, same as featureRowsOf's
      // own comment (feature-rows-select.ts) explains for the identical cast.
      const { spec } = castSpecFromRow(row as unknown as ClassFeatureRow, 14, () => 0);
      expect(spec.effect.scaling, `${row.name} (${row.edition})`).toEqual({ mode: "none" });
    }
  });

  // The mutation-provable half: simulates a future migration mistake (an
  // upcastDicePerLevel value landing on a ClassFeature row despite the "must
  // never" comment) on top of a REAL Second Wind row, whose grant `level` (1,
  // both editions) already satisfies resolveEffectScaling's `row.level > 0`
  // guard on its own. With castSpecFromRow's `level: 0` override in place,
  // that guard can't fire no matter what upcastDicePerLevel says, so scaling
  // stays `{ mode: "none" }`. Deleting the override arms it: `row.level`
  // reverts to the real grant level (1 > 0) and a truthy upcastDicePerLevel
  // flips scaling to `{ mode: "slotUpcast", dicePerStep: 2 }` — confirmed by
  // temporarily removing the override and re-running this test (went red).
  it("castSpecFromRow's level:0 override neutralizes an upcastDicePerLevel leaked onto a real row", async () => {
    const [row] = await prisma.classFeature.findMany({
      where: { class: { name: "Fighter" }, name: "Second Wind", edition: "EDITION_2014" },
    });
    expect(row).toBeDefined();
    const armed = { ...row, upcastDicePerLevel: 2 } as unknown as ClassFeatureRow;
    const { spec } = castSpecFromRow(armed, 14, () => 0);
    expect(spec.effect.scaling).toEqual({ mode: "none" });
  });
});
