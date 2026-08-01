// --- StartingEquipmentPackage seeder (#1519/#1533 classes; #1565 backgrounds) -
// The executable counterpart to starting-equipment.ts's DATA
// (STARTING_EQUIPMENT_PACKAGES, BACKGROUND_STARTING_EQUIPMENT_PACKAGES) —
// split out per #1277 AC 4 / scripts/check-seed-data-modules.sh, which
// forbids prisma/upsert/await logic in a seed DATA module. Mirrors
// seed-class-features.ts's content/logic split for the same family shape
// (one class- or background-authoring unit per row, here per (classId,
// edition) or (backgroundId, edition) rather than per (classId, subclassId,
// name, edition)).
//
// No assertEveryBackgroundEditionHasPackage guard exists here, unlike
// assertEveryClassEditionHasPackage below (deliberate, not an oversight):
// BACKGROUND_STARTING_EQUIPMENT_PACKAGES covers exactly seven (backgroundName,
// edition) pairs by design — Folk Hero has no package in either edition
// (PHB'24 dropped it), and 2014 Charlatan/Criminal/Noble/Sage/Soldier have
// none either (SRD 5.1 ships only Acolyte) — so a guard requiring every seeded
// Background to have a package in both editions would fail on content left
// unfinished ON PURPOSE (see starting-equipment.ts's background-section
// header). Content correctness for the seven pairs that DO exist is
// starting-equipment.test.ts's job, same division of labour as the class
// guard's own docstring describes.
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

// --- nested create-input builders --------------------------------------
// Each split out purely to keep cyclomatic/cognitive complexity low per
// function — prisma/seed/** carries no coverage instrumentation (vitest.config
// .ts's coverage `include` is `src/**/*.ts` only), so every function here
// floors at the uncovered-CRAP formula regardless of real test coverage;
// collectClassPairCounts/pairCount (seed-class-features.ts) is the precedent
// for fixing this by extraction rather than a suppression.
function itemCreateInput(item: FixedItemRef, position: number) {
  return { position, catalogName: item.catalogName, quantity: item.quantity ?? 1 };
}

// weaponClass/weaponRange (NOT the wire's `range`) — named after
// ItemWeaponDetail's columns per the schema's own comment; this is the ONE
// mapper that renames the wire's `filter.range` onto `weaponRange`.
// toolCategory (#1564) is this function's inverse of mapOpenPick's own
// omission rule for the same field. Split out of openPickCreateInput purely
// to keep that function's own cyclomatic complexity low (this file's header
// on why prisma/seed/** floors at the uncovered-CRAP formula regardless of
// real test coverage).
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
// Split out of packageCreateData purely to keep that function's own
// cyclomatic complexity low (this file's header explains why).
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

// #1565's twin of classPackageCreateData above — backgroundId instead of
// classId (StartingEquipmentPackage's two owner FKs are mutually exclusive,
// enforced by the model's CHECK constraint; omitting classId here leaves it
// at the column's NULL default, same as classPackageCreateData omitting
// backgroundId).
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

// Delete-then-recreate per (classId, edition) — #1533 [R7]. A nested `create`
// under an `upsert` would duplicate the whole group/option/item tree on the
// SECOND `npx prisma db seed` (the existing package row updates, but every
// nested `create` runs again alongside the survivors from the first run).
// Deleting the package row first (cascade removes every child row) makes
// each run start from empty, so the recreated tree is identical every time —
// proven by starting-equipment-migration.test.ts running the seeder twice
// and asserting group counts are unchanged.
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

// #1565's twin of resolveClassIdsByName above — NOT interchangeable the way
// the naming suggests: CharacterClass.name is genuinely unique, but
// Background is @@unique([name, edition]), so one name can legitimately own
// up to three rows (NULL/2014/2024, #1306). Guarantees the returned Map has
// at most one id per name — throws, naming the background and every edition
// found, rather than letting a name that resolves to more than one row
// silently pick whichever `findMany` happened to return last (a real hazard
// the moment Charlatan/Folk Hero/Noble get tagged EDITION_2014, or any
// background forks per #1348 generally: a fork sharing a name with an
// existing packaged background would silently misfile that package onto the
// wrong row with no error anywhere). Every background this module actually
// resolves today has exactly one row per name, so this throws on nobody yet.
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

// staleCatalogRowsWhere (prune.ts) always builds a THIRD `edition: null`
// OR-branch, because every one of its existing callers (Feat/GrantedAbility/
// Action) has a nullable `edition` column where NULL means "shared".
// StartingEquipmentPackage.edition is deliberately NON-NULLABLE (there is no
// edition-neutral package) — verified empirically running `npx prisma db
// seed` end-to-end: Prisma's generated WhereInput for a non-nullable column
// rejects a literal `edition: null` filter outright ("Argument `edition` is
// missing"), so the shared helper's null branch cannot be handed to this
// model at all. This mirrors classFeatureStaleWhere's identical reasoning
// (seed-class-features.ts) for the identical non-nullable-edition shape,
// restricted to the two editions this family can actually hold rather than
// widening the shared helper to special-case a column shape none of its
// other callers has.
// Exported so starting-equipment-fork-reseed.test.ts can call it directly
// with a fixture `seeded` list and a probe-scoped `extraWhere` — the same
// "call the where-builder directly, never seedStartingEquipment itself"
// shape action-fork-reseed.test.ts uses for staleCatalogRowsWhere, so a test
// can prove the notIn:[] empty-partition trap without touching the real
// catalog. `extraWhere` is ANDed in as a value (never spread), same
// clobber-avoidance reasoning as staleCatalogRowsWhere's own.
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

// Prunes any CLASS StartingEquipmentPackage row (and its cascaded children)
// whose (name, edition) pair isn't in STARTING_EQUIPMENT_PACKAGES — both
// editions threaded (24 entries), never just EDITION_2014: the notIn:[]
// empty-partition trap is live here exactly as it is for every
// staleCatalogRowsWhere caller (#1533 [R7]) — a `seeded` list that omitted
// EDITION_2024 would give that partition `notIn: []`, which matches (and
// deletes) every 2024 package on the next reseed.
//
// extraWhere: { classId: { not: null } } (#1565) — this family's table is no
// longer class-only, so this sweep must touch ONLY class rows. Without this
// partition, a background row's `name` (which never appears in
// STARTING_EQUIPMENT_PACKAGES' className list) would satisfy BOTH editions'
// `notIn` and get deleted by the class prune the moment a background package
// was ever written — the exact cross-family notIn:[] trap this model's
// schema.prisma comment warns about, just one level up from the usual
// single-edition version.
async function pruneStaleClassPackages(prisma: PrismaClient): Promise<void> {
  const seeded = STARTING_EQUIPMENT_PACKAGES.map((r) => ({ identity: r.className, edition: r.edition }));
  await prisma.startingEquipmentPackage.deleteMany({
    where: startingEquipmentStaleWhere(seeded, { classId: { not: null } }),
  });
}

// #1565's twin of pruneStaleClassPackages above — same reasoning, mirrored:
// extraWhere: { backgroundId: { not: null } } confines this sweep to
// background rows only, so it can never delete a class package (whose `name`
// never appears in BACKGROUND_STARTING_EQUIPMENT_PACKAGES' backgroundName list).
async function pruneStaleBackgroundPackages(prisma: PrismaClient): Promise<void> {
  const seeded = BACKGROUND_STARTING_EQUIPMENT_PACKAGES.map((r) => ({
    identity: r.backgroundName,
    edition: r.edition,
  }));
  await prisma.startingEquipmentPackage.deleteMany({
    where: startingEquipmentStaleWhere(seeded, { backgroundId: { not: null } }),
  });
}

/**
 * Seeds every StartingEquipmentPackage row — class (#1519/#1533) and
 * background (#1565) — and prunes stale ones in two independent sweeps (see
 * pruneStaleClassPackages/pruneStaleBackgroundPackages). Exported (not
 * module-private) so a test can call it directly, the same reason
 * seedClassFeatures is exported.
 */
export async function seedStartingEquipment(prisma: PrismaClient): Promise<void> {
  const classNames = [...new Set(STARTING_EQUIPMENT_PACKAGES.map((r) => r.className))];
  const classIdByName = await resolveClassIdsByName(prisma, classNames);
  await writeAllPackages(prisma, classIdByName);
  await pruneStaleClassPackages(prisma);

  const backgroundNames = [...new Set(BACKGROUND_STARTING_EQUIPMENT_PACKAGES.map((r) => r.backgroundName))];
  const backgroundIdByName = await resolveBackgroundIdsByName(prisma, backgroundNames);
  await writeAllBackgroundPackages(prisma, backgroundIdByName);
  await pruneStaleBackgroundPackages(prisma);

  // Runs LAST, after both prunes, so the window this inspects includes their
  // deletions — mirrors seedClassFeatures' own ordering rationale. Class-only
  // by design (#1565 deliberately adds no background analog — see this
  // module's header for why a "every background has a package" guard would
  // fail on the three backgrounds left without one on purpose).
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

// The "silent missing package" check for ONE (class, edition) pair — split out
// purely to keep assertEveryClassEditionHasPackage's own complexity low (see
// this file's header on why prisma/seed/** has no coverage instrumentation).
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

// One class's two editions — split out of evaluateAllPairs below for the
// same complexity reason (this file's header).
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

// Every (class, edition) pair across every known class name — split out of
// assertEveryClassEditionHasPackage so that function itself stays a
// straight-line call sequence (this file's header explains why every
// function here floors at the uncovered-CRAP formula regardless of real
// test coverage, forcing extraction over a single big loop).
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
 * Post-write presence guard (#1533 [R5]): every class named in EITHER
 * STARTING_EQUIPMENT_PACKAGES (the seed input) OR CLASSES (catalog-data.ts,
 * the CharacterClass seed input) must have a StartingEquipmentPackage row
 * with >= 1 group in EACH of EDITION_2014 and EDITION_2024. Checking against
 * the union (not just STARTING_EQUIPMENT_PACKAGES' own class list) is what
 * catches a class the literal forgot entirely, not just one it under-seeded.
 *
 * Deliberately NOT `prisma.characterClass.findMany()` unfiltered — that is
 * assertEveryClassEditionPopulated's PRE-#1543 shape, which swept transient
 * fixture CharacterClass rows ("Test Class" in characters.test.ts, plus four
 * more test files) and produced deterministic cross-file CI failures
 * (fixed at bf31582d). Filtering `characterClass.findMany` to the exact
 * name set this function already knows about (from the two real literals,
 * never a DB-derived list) makes a same-named fixture row structurally
 * unreachable here: a test's "Test Class" is in neither STARTING_EQUIPMENT_
 * PACKAGES nor CLASSES, so it's never in the `where: { name: { in } } }`
 * filter at all.
 *
 * PRESENCE ONLY: "a package exists with >= 1 group" says nothing about
 * whether its content is a correct transcription of that edition's rules text
 * — this guard would pass equally on a package with the right group count and
 * the wrong items. Content correctness is starting-equipment.test.ts's job
 * (value assertions against a committed fixture per edition, #1535).
 *
 * Exported so a test can call it against a deliberately broken DB state.
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
