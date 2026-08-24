// Runs against the real seeded catalog: the template DB the test setup clones
// from has already run `prisma db seed`. seedClassFeatures is exported
// precisely so this suite can re-run it in-process (seed.ts's main()
// self-invokes at module load and exports nothing).
import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { castSpecFromRow } from "@/lib/classes/actions.js";
import type { ClassFeatureRow } from "@/lib/classes/class-feature-rows.js";

import { CLASS_FEATURES } from "../class-features.js";
import { seedClassFeatures } from "../seed-class-features.js";
import { RESEED_TIMEOUT_MS } from "./reseed-timeout.js";

describe("ClassFeature migration — row count (#1523)", () => {
  it("the seeded table holds exactly the row count CLASS_FEATURES derives from the registry", async () => {
    // CLASS_FEATURES is built at import time from source, so this compares a
    // live Postgres COUNT against an independent derivation, never a literal.
    const actual = await prisma.classFeature.count();
    expect(actual).toBe(CLASS_FEATURES.length);
  });

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

describe("ClassFeature migration — the already-forked pairs were not duplicated (#1523)", () => {
  it("Cleric Domain Spells: exactly one EDITION_2014 row per domain, no EDITION_2024 row anywhere", async () => {
    const rows = await prisma.classFeature.findMany({
      where: { name: "Domain Spells", class: { name: "Cleric" } },
      select: { level: true, edition: true, description: true, subclass: { select: { name: true } } },
    });
    expect(rows).toHaveLength(2); // Life Domain + Trickery Domain, EDITION_2014 only

    for (const subclassName of ["Life Domain", "Trickery Domain"]) {
      const pair = rows.filter((r) => r.subclass?.name === subclassName);
      expect(pair).toHaveLength(1);
      expect(pair[0].level).toBe(1);
      expect(pair[0].edition).toBe("EDITION_2014");
    }
  });

  // Owner decision (#1233): The Archfey's/The Great Old One's PHB'24 reworks
  // are non-SRD — no 2024 rows authored.
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

const POPULATED_ROW_NAMES = new Set(["Second Wind", "Action Surge", "Indomitable"]);

function isPopulatedFighterRow(row: { className: string; subclassSlug: string | null; name: string }): boolean {
  return row.className === "Fighter" && row.subclassSlug === null && POPULATED_ROW_NAMES.has(row.name);
}

const POPULATED_BARBARIAN_ROW_NAMES = new Set(["Rage", "Reckless Attack"]);

function isPopulatedBarbarianRow(row: { className: string; subclassSlug: string | null; name: string }): boolean {
  return row.className === "Barbarian" && row.subclassSlug === null && POPULATED_BARBARIAN_ROW_NAMES.has(row.name);
}

function isPopulatedRogueRow(row: { className: string; subclassSlug: string | null; name: string }): boolean {
  if (row.className !== "Rogue") return false;
  if (row.subclassSlug === null && row.name === "Cunning Action") return true;
  if (row.subclassSlug === "rogue-thief" && row.name === "Fast Hands") return true;
  return false;
}

// Keyed with edition: several Monk names repeat across subclasses/editions
// with genuinely different descriptor columns per row.
const POPULATED_MONK_ROW_KEYS = new Set([
  "null::Deflect Attacks::EDITION_2024",
  "null::Deflect Missiles::EDITION_2014",
  "null::Bonus Unarmed Strike::EDITION_2014",
  "null::Bonus Unarmed Strike::EDITION_2024",
  "null::Flurry of Blows::EDITION_2024",
  "null::Flurry of Blows::EDITION_2014",
  "null::Patient Defense::EDITION_2024",
  "null::Patient Defense (1 Focus)::EDITION_2024",
  "null::Step of the Wind::EDITION_2024",
  "null::Step of the Wind (1 Focus)::EDITION_2024",
  "null::Patient Defense::EDITION_2014",
  "null::Step of the Wind::EDITION_2014",
  "null::Deflect Attacks — Redirect::EDITION_2024",
  "null::Deflect Missiles — Throw Back::EDITION_2014",
  "null::Empty Body — Invisibility::EDITION_2014",
  "null::Empty Body — Astral Projection::EDITION_2014",
  "monk-warrior-of-the-open-hand::Wholeness of Body::EDITION_2024",
  "monk-warrior-of-the-open-hand::Fleet Step::EDITION_2024",
  "monk-way-of-the-open-hand::Wholeness of Body::EDITION_2014",
  "monk-way-of-the-open-hand::Tranquility::EDITION_2014",
  "monk-way-of-the-open-hand::Wholeness of Body — Action::EDITION_2014",
  "monk-warrior-of-shadow::Shadow Step::EDITION_2024",
  "monk-warrior-of-shadow::Cloak of Shadows::EDITION_2024",
  "monk-warrior-of-shadow::Shadow Arts (Darkness)::EDITION_2024",
  "monk-way-of-shadow::Shadow Arts::EDITION_2014",
  "monk-way-of-shadow::Shadow Step::EDITION_2014",
  "monk-way-of-shadow::Cloak of Shadows::EDITION_2014",
  "monk-way-of-shadow::Opportunist::EDITION_2014",
  "monk-warrior-of-the-elements::Elemental Attunement::EDITION_2024",
  "monk-warrior-of-the-elements::Elemental Burst::EDITION_2024",
  "monk-way-of-the-four-elements::Elemental Attunement::EDITION_2014",
  "monk-way-of-the-four-elements::Elemental Discipline::EDITION_2014",
  "monk-warrior-of-mercy::Hand of Healing::EDITION_2014",
  "monk-warrior-of-mercy::Hand of Healing::EDITION_2024",
  "monk-warrior-of-mercy::Hand of Healing (Flurry replacement)::EDITION_2014",
  "monk-warrior-of-mercy::Hand of Healing (Flurry replacement)::EDITION_2024",
]);

function isPopulatedMonkRow(row: RowKey): boolean {
  if (row.className !== "Monk") return false;
  return POPULATED_MONK_ROW_KEYS.has(`${row.subclassSlug ?? "null"}::${row.name}::${row.edition}`);
}

// Arcane Recovery is spent through the spellcasting op, not the actions
// endpoint — no activation/cost columns.
function isPopulatedWizardRow(row: { className: string; subclassSlug: string | null; name: string }): boolean {
  return row.className === "Wizard" && row.subclassSlug === null && row.name === "Arcane Recovery";
}

function isPopulatedIllusorySelfRow(row: { className: string; subclassSlug: string | null; name: string }): boolean {
  return row.className === "Wizard" && row.subclassSlug === "wizard-school-of-illusion" && row.name === "Illusory Self";
}

function isPopulatedBattleMasterPoolRow(row: { className: string; subclassSlug: string | null; name: string }): boolean {
  return row.className === "Fighter" && row.subclassSlug === "fighter-battle-master" && row.name === "Combat Superiority";
}

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

// Identity-only resourceKey — Bardic Inspiration's pool itself stays in
// bard's resourceFn.
const POPULATED_BARD_ROW_KEYS = new Set(["Bard::null::Bardic Inspiration::EDITION_2014", "Bard::null::Bardic Inspiration::EDITION_2024"]);

function isPopulatedBardRow(row: RowKey): boolean {
  return POPULATED_BARD_ROW_KEYS.has(`${row.className}::${row.subclassSlug ?? "null"}::${row.name}::${row.edition}`);
}

const POPULATED_RANGER_ROW_KEYS = new Set([
  "Ranger::null::Favored Enemy::EDITION_2024",
  "Ranger::null::Tireless::EDITION_2024",
  "Ranger::null::Nature's Veil::EDITION_2024",
]);

function isPopulatedRangerRow(row: RowKey): boolean {
  return POPULATED_RANGER_ROW_KEYS.has(`${row.className}::${row.subclassSlug ?? "null"}::${row.name}::${row.edition}`);
}

const POPULATED_SORCERER_ROW_KEYS = new Set([
  "Sorcerer::null::Innate Sorcery::EDITION_2024",
  "Sorcerer::null::Sorcerous Restoration::EDITION_2024",
  "Sorcerer::null::Font of Magic::EDITION_2014",
  "Sorcerer::null::Font of Magic::EDITION_2024",
  "Sorcerer::sorcerer-wild-magic::Tides of Chaos::EDITION_2014",
  "Sorcerer::sorcerer-wild-magic::Tides of Chaos::EDITION_2024",
  "Sorcerer::sorcerer-draconic-bloodline::Dragon Wings::EDITION_2024",
  "Sorcerer::sorcerer-wild-magic::Tamed Surge::EDITION_2024",
  "Sorcerer::null::Metamagic::EDITION_2014",
  "Sorcerer::null::Metamagic::EDITION_2024",
]);

function isPopulatedSorcererRow(row: RowKey): boolean {
  return POPULATED_SORCERER_ROW_KEYS.has(`${row.className}::${row.subclassSlug ?? "null"}::${row.name}::${row.edition}`);
}

function isPopulatedClericRow(row: RowKey): boolean {
  return (
    row.className === "Cleric" &&
    row.subclassSlug === null &&
    ((row.edition === "EDITION_2014" && row.name === "Channel Divinity: Turn Undead") ||
      (row.edition === "EDITION_2024" && row.name === "Channel Divinity"))
  );
}

// Wild Shape's 2014 pool stays in druid's resourceFn — that row carries an
// identity-only resourceKey.
const POPULATED_DRUID_ROW_KEYS = new Set([
  "Druid::null::Wild Shape::EDITION_2014",
  "Druid::null::Wild Shape::EDITION_2024",
  "Druid::druid-circle-of-the-moon::Moonlight Step::EDITION_2024",
]);

function isPopulatedDruidRow(row: RowKey): boolean {
  return POPULATED_DRUID_ROW_KEYS.has(`${row.className}::${row.subclassSlug ?? "null"}::${row.name}::${row.edition}`);
}

const POPULATED_PALADIN_ROW_NAMES = new Set(["Channel Divinity", "Lay on Hands"]);

function isPopulatedPaladinRow(row: RowKey): boolean {
  if (row.className !== "Paladin" || row.subclassSlug !== null) return false;
  if (POPULATED_PALADIN_ROW_NAMES.has(row.name)) return true;
  return row.name === "Divine Sense" && row.edition === "EDITION_2014";
}

// Training in War and Song sets only `improvements`, which this suite never
// selects — it stays correctly unpopulated here.
function isPopulatedBladesingerRow(row: RowKey): boolean {
  return row.className === "Wizard" && row.subclassSlug === "wizard-bladesinging" && (row.name === "Bladesong" || row.name === "Song of Defense");
}

// `edition` is part of the key: a class can populate a descriptor column on
// one edition's row only — Ranger's Favored Enemy carries a pool only in its
// 2024 row (#1230). Edition-invariant predicates simply ignore the field.
type RowKey = { className: string; subclassSlug: string | null; name: string; edition: string };

function isSaveDcRow(row: RowKey): boolean {
  return isPopulatedBattleMasterPoolRow(row);
}

// Every populated-row predicate registers here, once — a second aggregator is
// how a row silently escapes the descriptor sweep. An array + `.some()`
// rather than an `||` chain keeps this function's cyclomatic count at 1
// (prisma/seed/** has no coverage instrumentation, so CRAP floors at CC^2+CC).
const POPULATED_ROW_PREDICATES: ((row: RowKey) => boolean)[] = [
  isPopulatedFighterRow,
  isPopulatedBattleMasterPoolRow,
  isPopulatedBarbarianRow,
  isPopulatedRogueRow,
  isPopulatedMonkRow,
  isPopulatedWarlockRow,
  isPopulatedWizardRow,
  isPopulatedIllusorySelfRow,
  isPopulatedBardRow,
  isPopulatedRangerRow,
  isPopulatedSorcererRow,
  isPopulatedClericRow,
  isPopulatedDruidRow,
  isPopulatedPaladinRow,
  isPopulatedBladesingerRow,
];

function isPopulatedRow(row: RowKey): boolean {
  return POPULATED_ROW_PREDICATES.some((predicate) => predicate(row));
}

// Keyed by (className, subclassSlug, name): base Bard has no "Extra Attack"
// row at all — only College of Valor's subclass-tagged one, so the tuple is
// what names that row precisely.
const DERIVED_STAT_ROW_KEYS = new Set([
  "Fighter::null::Extra Attack",
  "Barbarian::null::Extra Attack",
  "Monk::null::Extra Attack",
  "Paladin::null::Extra Attack",
  "Ranger::null::Extra Attack",
  "Bard::bard-college-of-valor::Extra Attack",
  "Fighter::fighter-battle-master::Combat Superiority",
  "Fighter::fighter-battle-master::Student of War",
  // EDITION_2014 only (#1676).
  "Wizard::wizard-bladesinging::Extra Attack",
  "Fighter::fighter-champion::Improved Critical",
  "Rogue::null::Expertise",
  "Bard::null::Expertise",
  // Deft Explorer and Scholar are EDITION_2024 only (#1588); the whole
  // expertiseChoiceCount ladder rides Deft Explorer, not the L9 Expertise row.
  "Ranger::null::Deft Explorer",
  "Wizard::null::Scholar",
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

function expectRowDescriptors(row: DescriptorRow & RowKey): void {
  const key = {
    className: row.className,
    subclassSlug: row.subclassSlug,
    name: row.name,
    edition: row.edition,
  };
  if (isPopulatedRow(key)) {
    // Falls through rather than returning early: Combat Superiority sets a
    // resource pool AND a derivedStat AND saveDcAbilities on the SAME row.
    expect(row.resourceKey, row.name).not.toBeNull();
  } else {
    expectNullResourceColumns(row);
  }

  if (isDerivedStatRow(key)) {
    expect(row.derivedStat, row.name).not.toBeNull();
    expect(row.derivedStatTiers, row.name).not.toBeNull();
  } else {
    expect(row.derivedStat, row.name).toBeNull();
    expect(row.derivedStatTiers, row.name).toBeNull();
  }

  // saveDcAbilities is a NOT NULL String[] column — its reset is [], not NULL.
  if (isSaveDcRow(key)) {
    expect(row.saveDcAbilities, row.name).toEqual(["strength", "dexterity"]);
  } else {
    expect(row.saveDcAbilities, row.name).toEqual([]);
  }
}

describe("ClassFeature migration — every descriptor column is NULL/default, except the rows isPopulatedRow names", () => {
  it("no row has a populated descriptor column, except Fighter's (#1528/#1546), Barbarian's Rage (#1223), Wizard's (#1234), Warlock's (#1233), Ranger's (#1230), Sorcerer's (#1232), Cleric's (#1225), Paladin's (#1229), Wizard's Bladesinger (#1676) and Bard's/Druid's/Sorcerer's Metamagic/Paladin's/Cleric's row-driven actions (#1909)", async () => {
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
    // Pinned to the registry-derived count, not `> 0`: a silently dropped or
    // leftover row would still pass every per-row expectation below.
    expect(rows.length).toBe(CLASS_FEATURES.length);

    for (const row of rows) {
      expectRowDescriptors({ ...row, className: row.class.name, subclassSlug: row.subclass?.slug ?? null });
    }
  });

  // Prisma deserializes both SQL NULL (Prisma.DbNull) and a stored JSON
  // `null` (Prisma.JsonNull) to the JS value `null`, so the per-row
  // `toBeNull()` checks above cannot tell them apart — that gap once let
  // seedClassFeatures write JsonNull into all three Json? columns while this
  // suite stayed green, which a later `WHERE col IS NULL` filter would
  // silently miss. Assert the SQL-level state directly.
  it("resourceTotals/resourceDieTiers/derivedStatTiers are SQL NULL (Prisma.DbNull), not a stored JSON null, everywhere they aren't authored", async () => {
    // Per-class counts of rows with authored resourceTotals. After parallel
    // branches merge, re-measure on the merged tree — each branch's own total
    // was correct alone (#1230/#1232/#1225/#1226/#1229).
    const FIGHTER_POOL_ROWS = 6;
    const BATTLE_MASTER_POOL_ROWS = 2;
    const BARBARIAN_POOL_ROWS = 2;
    const WIZARD_POOL_ROWS = 4;
    const WARLOCK_POOL_ROWS = 9;
    const RANGER_POOL_ROWS = 3;
    const SORCERER_POOL_ROWS = 8;
    const CLERIC_POOL_ROWS = 2;
    const DRUID_POOL_ROWS = 2;
    const PALADIN_POOL_ROWS = 2;
    const BLADESINGER_POOL_ROWS = 1;
    const OPEN_HAND_POOL_ROWS = 1;
    const populatedResourceTotalsCount =
      FIGHTER_POOL_ROWS + BATTLE_MASTER_POOL_ROWS + BARBARIAN_POOL_ROWS + WIZARD_POOL_ROWS +
      WARLOCK_POOL_ROWS + RANGER_POOL_ROWS + SORCERER_POOL_ROWS + CLERIC_POOL_ROWS +
      DRUID_POOL_ROWS + PALADIN_POOL_ROWS + BLADESINGER_POOL_ROWS + OPEN_HAND_POOL_ROWS;
    // Combat Superiority (both editions) is the only row with a die-size tier.
    const populatedResourceDieTiersCount = BATTLE_MASTER_POOL_ROWS;
    // Bladesinger's Extra Attack is EDITION_2014-only; Deft Explorer and
    // Scholar are EDITION_2024-only — one row each, not two. A future
    // asymmetric key needs the same correction, not a silent re-multiply.
    const SINGLE_EDITION_DERIVED_STAT_KEYS = 3;
    const populatedDerivedStatTiersCount = DERIVED_STAT_ROW_KEYS.size * 2 - SINGLE_EDITION_DERIVED_STAT_KEYS;
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

describe("ClassFeature migration — Barbarian's #1223/#1686 Rage rows are populated exactly as authored", () => {
  it("resourceKey/recharge/totals AND activation/cost/effectBuffs — Rage is fully row-driven now", async () => {
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

    const rageBuff = [
      {
        key: "rage",
        target: "meleeDamage",
        modifier: [
          { minLevel: 1, value: 2 },
          { minLevel: 9, value: 3 },
          { minLevel: 16, value: 4 },
        ],
        duration: "while-active",
        resistDamageTypes: ["bludgeoning", "piercing", "slashing"],
        rollEffects: [
          { mode: "advantage", kind: "check", ability: "strength" },
          { mode: "advantage", kind: "save", ability: "strength" },
        ],
      },
    ];
    for (const row of rows) {
      expect(row.activationCost, row.edition).toBe("bonusAction");
      expect(row.resolverKind, row.edition).toBe("toggle");
      expect(row.costKind, row.edition).toBe("pool");
      expect(row.costPoolKey, row.edition).toBe("rage");
      expect(row.costBase, row.edition).toBe(1);
      expect(row.effectBuffs, row.edition).toEqual(rageBuff);
    }
  });
});

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
    // Exhaustive over the full table despite the title — byte-identical text
    // is the whole point.
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

// EffectRow's `level` is the spell-scaling axis; a ClassFeature row's `level`
// is the character level the feature is granted at. castSpecFromRow's
// `{ ...row, level: 0 }` override keeps resolveEffectScaling from reading a
// grant level as a spell level. Both tests go through castSpecFromRow itself,
// never a hand-copied adapter — a copy stays green when the real one is
// deleted.
describe("ClassFeature EffectRow landmine — no Fighter row ever resolves a non-'none' scaling mode (#1528)", () => {
  it("every REAL Fighter row with effectKind set resolves { mode: 'none' } through castSpecFromRow", async () => {
    const rows = await prisma.classFeature.findMany({
      where: { class: { name: "Fighter" }, effectKind: { not: null } },
    });
    // This loop alone cannot catch a deleted `level: 0` override: ClassFeature
    // has no cantripScaling/upcastDicePerLevel columns (and must never gain
    // them), so no real row can arm the landmine — the adversarial test below
    // is what exercises the override.
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      // Prisma types the Json columns as opaque JsonValue — cast to
      // ClassFeatureRow's concrete shape, the same cast featureRowsOf makes.
      const { spec } = castSpecFromRow(row as unknown as ClassFeatureRow, 14, () => 0);
      expect(spec.effect.scaling, `${row.name} (${row.edition})`).toEqual({ mode: "none" });
    }
  });

  // Simulates upcastDicePerLevel leaking onto a real row: Second Wind's grant
  // level (1) satisfies resolveEffectScaling's `row.level > 0` guard on its
  // own, so only castSpecFromRow's level:0 override keeps scaling at "none".
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
