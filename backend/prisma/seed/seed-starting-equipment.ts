// DATA (STARTING_EQUIPMENT_PACKAGES, BACKGROUND_STARTING_EQUIPMENT_PACKAGES)
// lives in starting-equipment.ts, split out per #1277 AC 4 /
// scripts/check-seed-data-modules.sh, which forbids prisma/upsert/await
// logic in a seed DATA module.
//
// No assertEveryBackgroundEditionHasPackage guard exists here, unlike
// assertEveryClassEditionHasPackage below: BACKGROUND_STARTING_EQUIPMENT_PACKAGES
// covers exactly eight (backgroundName, edition) pairs by design (see
// starting-equipment.ts's background-section header) — Folk Hero exists only
// in 2014 and the other six only in 2024, so a guard requiring every seeded
// Background to have a package in both editions would fail on purpose.
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import type {
  ClassStartingEquipment,
  EquipmentBundle,
  EquipmentChoiceGroup,
  FixedItemRef,
  OpenPick,
} from "@character-sheet/shared-types";

import { CLASSES } from "./catalog-data.js";
import {
  STARTING_EQUIPMENT_PACKAGES,
  BACKGROUND_STARTING_EQUIPMENT_PACKAGES,
  type StartingEquipmentSeed,
  type BackgroundStartingEquipmentSeed,
} from "./starting-equipment.js";
import type { SeedEdition } from "./edition.js";

const EDITIONS: readonly SeedEdition[] = ["EDITION_2014", "EDITION_2024"];

// prisma/seed/** has no coverage instrumentation, so every function here
// floors at the uncovered-CRAP formula — functions are split small to keep it
// low (precedent: collectClassPairCounts/pairCount, seed-class-features.ts).
function itemCreateInput(item: FixedItemRef, position: number) {
  return { position, catalogName: item.catalogName, quantity: item.quantity ?? 1 };
}

// weaponClass/weaponRange (not the wire's `range`) — named after
// ItemWeaponDetail's columns; the one mapper renaming filter.range onto
// weaponRange. toolCategory (#1564) is this function's inverse of
// mapOpenPick's own omission rule.
function openPickFilterCreateInput(filter: OpenPick["filter"]) {
  return {
    weaponClass: filter.weaponClass ?? null,
    weaponRange: filter.range ?? null,
    toolCategory: filter.toolCategory ?? null,
  };
}

// boundToToolChoice/quantity are this function's inverse of mapOpenPick's own
// omission rules — a false/undefined boundToToolChoice defaults to the
// column's own default (false).
function openPickCreateInput(pick: OpenPick, position: number) {
  return {
    position,
    label: pick.label,
    ...openPickFilterCreateInput(pick.filter),
    boundToToolChoice: pick.boundToToolChoice ?? false,
    quantity: pick.quantity ?? 1,
  };
}

function optionCreateInput(option: EquipmentBundle, position: number) {
  return {
    position,
    label: option.label,
    gold: option.gold ?? 0,
    items: { create: (option.items ?? []).map((item, i) => itemCreateInput(item, i)) },
    openPicks: { create: (option.openPicks ?? []).map((pick, i) => openPickCreateInput(pick, i)) },
  };
}

function groupCreateInput(group: EquipmentChoiceGroup, position: number) {
  return {
    position,
    label: group.label,
    options: { create: group.options.map((option, i) => optionCreateInput(option, i)) },
  };
}

// gold is null on the wire when this edition has no roll-for-gold rule at all
// (#1564 commit 3, PHB'24) — the three columns are jointly null in that case,
// never independently, mirroring the wire's single StartingGold | null field.
function goldColumnsCreateInput(gold: ClassStartingEquipment["gold"]) {
  if (!gold) return { goldDiceCount: null, goldDiceFaces: null, goldMultiplier: null };
  return { goldDiceCount: gold.diceCount, goldDiceFaces: gold.diceFaces, goldMultiplier: gold.multiplier };
}

function classPackageCreateData(classId: string, className: string, edition: SeedEdition, pkg: ClassStartingEquipment) {
  return {
    classId,
    name: className,
    edition,
    ...goldColumnsCreateInput(pkg.gold),
    groups: { create: pkg.groups.map((group, i) => groupCreateInput(group, i)) },
  };
}

// Twin of classPackageCreateData — backgroundId instead of classId (the two
// owner FKs are mutually exclusive, enforced by a CHECK constraint; omitting
// one leaves it at the column's NULL default) (#1565).
function backgroundPackageCreateData(
  backgroundId: string,
  backgroundName: string,
  edition: SeedEdition,
  pkg: ClassStartingEquipment,
) {
  return {
    backgroundId,
    name: backgroundName,
    edition,
    ...goldColumnsCreateInput(pkg.gold),
    groups: { create: pkg.groups.map((group, i) => groupCreateInput(group, i)) },
  };
}

// Delete-then-recreate per (classId, edition), not upsert-with-nested-create
// (#1533 [R7]) — upsert would duplicate the child tree on a second seed run.
async function writeOneClassPackage(prisma: PrismaClient, classId: string, seed: StartingEquipmentSeed): Promise<void> {
  await prisma.startingEquipmentPackage.deleteMany({ where: { classId, edition: seed.edition } });
  await prisma.startingEquipmentPackage.create({
    data: classPackageCreateData(classId, seed.className, seed.edition, seed.package),
  });
}

// #1565's twin of writeOneClassPackage above — same delete-then-recreate
// reasoning, keyed by (backgroundId, edition) instead of (classId, edition).
async function writeOneBackgroundPackage(
  prisma: PrismaClient,
  backgroundId: string,
  seed: BackgroundStartingEquipmentSeed,
): Promise<void> {
  await prisma.startingEquipmentPackage.deleteMany({ where: { backgroundId, edition: seed.edition } });
  await prisma.startingEquipmentPackage.create({
    data: backgroundPackageCreateData(backgroundId, seed.backgroundName, seed.edition, seed.package),
  });
}

async function resolveClassIdsByName(prisma: PrismaClient, classNames: string[]): Promise<Map<string, string>> {
  const rows = await prisma.characterClass.findMany({
    where: { name: { in: classNames } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((c) => [c.name, c.id]));
}

// Unlike resolveClassIdsByName, Background is @@unique([name, edition]) — one
// name can own up to three rows (NULL/2014/2024, #1306). Throws on ambiguity
// rather than silently picking whichever findMany returns last (#1348).
export async function resolveBackgroundIdsByName(
  prisma: PrismaClient,
  backgroundNames: string[],
): Promise<Map<string, string>> {
  const rows = await prisma.background.findMany({
    where: { name: { in: backgroundNames } },
    select: { id: true, name: true, edition: true },
  });

  const rowsByName = new Map<string, typeof rows>();
  for (const row of rows) {
    rowsByName.set(row.name, [...(rowsByName.get(row.name) ?? []), row]);
  }

  const ambiguous = [...rowsByName.entries()].filter(([, group]) => group.length > 1);
  if (ambiguous.length > 0) {
    const detail = ambiguous
      .map(([name, group]) => `"${name}" (${group.map((r) => r.edition ?? "shared").join(", ")})`)
      .join("; ");
    throw new Error(
      `seedStartingEquipment: ambiguous background name(s) resolve to more than one Background row — ${detail}. ` +
        "A BACKGROUND_STARTING_EQUIPMENT_PACKAGES entry cannot be written against a forked background by name alone.",
    );
  }

  return new Map([...rowsByName.entries()].map(([name, group]) => [name, group[0].id]));
}

async function writeAllPackages(prisma: PrismaClient, classIdByName: Map<string, string>): Promise<void> {
  for (const seed of STARTING_EQUIPMENT_PACKAGES) {
    const classId = classIdByName.get(seed.className);
    if (!classId) {
      throw new Error(`seedStartingEquipment: unknown class "${seed.className}" in STARTING_EQUIPMENT_PACKAGES`);
    }
    await writeOneClassPackage(prisma, classId, seed);
  }
}

async function writeAllBackgroundPackages(
  prisma: PrismaClient,
  backgroundIdByName: Map<string, string>,
): Promise<void> {
  for (const seed of BACKGROUND_STARTING_EQUIPMENT_PACKAGES) {
    const backgroundId = backgroundIdByName.get(seed.backgroundName);
    if (!backgroundId) {
      throw new Error(
        `seedStartingEquipment: unknown background "${seed.backgroundName}" in BACKGROUND_STARTING_EQUIPMENT_PACKAGES`,
      );
    }
    await writeOneBackgroundPackage(prisma, backgroundId, seed);
  }
}

// StartingEquipmentPackage.edition is non-nullable (no edition-neutral
// package) — Prisma rejects a literal `edition: null` filter on it, so
// staleCatalogRowsWhere's null-edition branch (prune.ts) can't be reused
// here; mirrors classFeatureStaleWhere's identical reasoning
// (seed-class-features.ts).
// `extraWhere` is ANDed in as a value, never spread — same clobber-avoidance
// as staleCatalogRowsWhere's own.
export function startingEquipmentStaleWhere(
  seeded: readonly { identity: string; edition: SeedEdition }[],
  extraWhere: object = {},
) {
  return {
    AND: [
      extraWhere,
      {
        OR: EDITIONS.map((edition) => ({
          edition,
          name: { notIn: seeded.filter((r) => r.edition === edition).map((r) => r.identity) },
        })),
      },
    ],
  };
}

// Both editions must be threaded (24 entries) — a `seeded` list omitting
// EDITION_2024 would give that partition `notIn: []`, deleting every 2024
// package on the next reseed (#1533 [R7]).
// extraWhere: { classId: { not: null } } confines this sweep to class rows —
// without it a background row's name would satisfy both editions' `notIn`
// and get deleted by the class prune (#1565).
async function pruneStaleClassPackages(prisma: PrismaClient): Promise<void> {
  const seeded = STARTING_EQUIPMENT_PACKAGES.map((r) => ({ identity: r.className, edition: r.edition }));
  await prisma.startingEquipmentPackage.deleteMany({
    where: startingEquipmentStaleWhere(seeded, { classId: { not: null } }),
  });
}

// Twin of pruneStaleClassPackages — extraWhere: { backgroundId: { not: null } }
// confines this sweep to background rows (#1565).
async function pruneStaleBackgroundPackages(prisma: PrismaClient): Promise<void> {
  const seeded = BACKGROUND_STARTING_EQUIPMENT_PACKAGES.map((r) => ({
    identity: r.backgroundName,
    edition: r.edition,
  }));
  await prisma.startingEquipmentPackage.deleteMany({
    where: startingEquipmentStaleWhere(seeded, { backgroundId: { not: null } }),
  });
}

export async function seedStartingEquipment(prisma: PrismaClient): Promise<void> {
  const classNames = [...new Set(STARTING_EQUIPMENT_PACKAGES.map((r) => r.className))];
  const classIdByName = await resolveClassIdsByName(prisma, classNames);
  await writeAllPackages(prisma, classIdByName);
  await pruneStaleClassPackages(prisma);

  const backgroundNames = [...new Set(BACKGROUND_STARTING_EQUIPMENT_PACKAGES.map((r) => r.backgroundName))];
  const backgroundIdByName = await resolveBackgroundIdsByName(prisma, backgroundNames);
  await writeAllBackgroundPackages(prisma, backgroundIdByName);
  await pruneStaleBackgroundPackages(prisma);

  // Runs LAST, after both prunes, so this inspects the post-prune state
  // (mirrors seedClassFeatures' ordering).
  await assertEveryClassEditionHasPackage(prisma);
}

export interface StartingEquipmentPopulationSummary {
  pairsChecked: number;
  rowsCounted: number;
}

interface PackageGroupCount {
  classId: string;
  edition: SeedEdition;
  groupCount: number;
}

async function loadPackageGroupCounts(prisma: PrismaClient, classIds: string[]): Promise<PackageGroupCount[]> {
  const rows = await prisma.startingEquipmentPackage.findMany({
    where: { classId: { in: classIds } },
    select: { classId: true, edition: true, _count: { select: { groups: true } } },
  });
  // classId is non-null for every row here (filtered by `classId: { in }`
  // above) — the `!` narrows the column's schema type (nullable since #1565's
  // background reuse), never a runtime assumption.
  return rows.map((r) => ({ classId: r.classId!, edition: r.edition, groupCount: r._count.groups }));
}

function buildGroupCountByPair(groupCounts: readonly PackageGroupCount[]): Map<string, number> {
  const byPair = new Map<string, number>();
  for (const g of groupCounts) byPair.set(`${g.classId}::${g.edition}`, g.groupCount);
  return byPair;
}

function pairFailure(
  className: string,
  edition: SeedEdition,
  classId: string | undefined,
  groupCountByPair: Map<string, number>,
): { failure: string | null; groupCount: number } {
  const groupCount = classId ? (groupCountByPair.get(`${classId}::${edition}`) ?? 0) : 0;
  if (groupCount === 0) {
    return { failure: `  ${className} / ${edition}: no package (or a package with 0 groups)`, groupCount };
  }
  return { failure: null, groupCount };
}

interface PairEvaluation {
  failures: string[];
  pairsChecked: number;
  rowsCounted: number;
}

function evaluatePairsForClass(
  className: string,
  classId: string | undefined,
  groupCountByPair: Map<string, number>,
): PairEvaluation {
  const failures: string[] = [];
  let rowsCounted = 0;
  for (const edition of EDITIONS) {
    const { failure, groupCount } = pairFailure(className, edition, classId, groupCountByPair);
    rowsCounted += groupCount;
    if (failure) failures.push(failure);
  }
  return { failures, pairsChecked: EDITIONS.length, rowsCounted };
}

function evaluateAllPairs(
  classNames: readonly string[],
  classIdByName: Map<string, string>,
  groupCountByPair: Map<string, number>,
): PairEvaluation {
  const failures: string[] = [];
  let pairsChecked = 0;
  let rowsCounted = 0;
  for (const className of classNames) {
    const perClass = evaluatePairsForClass(className, classIdByName.get(className), groupCountByPair);
    failures.push(...perClass.failures);
    pairsChecked += perClass.pairsChecked;
    rowsCounted += perClass.rowsCounted;
  }
  return { failures, pairsChecked, rowsCounted };
}

function throwIfPopulationFailures(failures: readonly string[]): void {
  if (failures.length === 0) return;
  throw new Error(
    [
      "seedStartingEquipment: StartingEquipmentPackage population guard failed (#1533) —",
      ...failures,
      "Re-run `npx prisma db seed`. This guard asserts PRESENCE only, never content",
      "correctness (starting-equipment.test.ts's job).",
    ].join("\n"),
  );
}

/**
 * Post-write presence guard (#1533 [R5]). Filtered to the known class-name
 * set (never an unfiltered characterClass.findMany) so a transient
 * test-fixture class can never be swept into the check.
 * PRESENCE ONLY — does not verify content correctness (starting-equipment.test.ts's job).
 */
export async function assertEveryClassEditionHasPackage(
  prisma: PrismaClient,
): Promise<StartingEquipmentPopulationSummary> {
  const classNames = [...new Set([...CLASSES.map((c) => c.name), ...STARTING_EQUIPMENT_PACKAGES.map((r) => r.className)])];
  const classIdByName = await resolveClassIdsByName(prisma, classNames);
  const groupCounts = await loadPackageGroupCounts(prisma, [...classIdByName.values()]);
  const groupCountByPair = buildGroupCountByPair(groupCounts);

  const { failures, pairsChecked, rowsCounted } = evaluateAllPairs(classNames, classIdByName, groupCountByPair);
  throwIfPopulationFailures(failures);

  return { pairsChecked, rowsCounted };
}
