// Executable counterpart to CLASS_FEATURES, split out because #1277 AC 4
// forbids write logic in a seed data module.
import { Prisma, type PrismaClient } from "../../src/generated/prisma/client.js";
import { upsertEditionRow, resolveEditionRow } from "../../src/lib/rules/catalog-edition.js";
import type { SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { SeedEdition } from "./edition.js";
import { CLASS_FEATURES, type ClassFeatureSeedRow } from "./class-features.js";
import { SUBCLASSES } from "./subclasses.js";

// The Json? columns use Prisma.DbNull (SQL NULL), never Prisma.JsonNull (a
// stored JSON `null` value): both deserialize to JS null, but only DbNull
// matches a `WHERE col IS NULL` filter.
const DESCRIPTOR_RESET = {
  resourceKey: null,
  resourceLabel: null,
  resourceRecharge: null,
  resourceTotals: Prisma.DbNull,
  resourceDieTiers: Prisma.DbNull,
  resourceRechargeTiers: Prisma.DbNull,
  resourceDetailTiers: Prisma.DbNull,
  resourceOnInitiative: Prisma.DbNull,
  choiceKey: null,
  choiceLabel: null,
  choiceCatalogSource: null,
  choiceCountTiers: Prisma.DbNull,
  activationCost: null,
  resolverKind: null,
  requiresUnarmored: false,
  regrants: [] as string[],
  reminder: null,
  count: null,
  actionOnly: false,
  costKind: null,
  costPoolKey: null,
  costBase: null,
  costPerStep: null,
  effectKind: null,
  effectDiceCount: null,
  effectDiceFaces: null,
  effectDieSource: null,
  effectModifier: null,
  effectModifierSource: null,
  damageType: null,
  attackType: null,
  saveAbility: null,
  saveEffect: null,
  buffTarget: null,
  buffModifier: null,
  derivedStat: null,
  derivedStatTiers: Prisma.DbNull,
  saveDcAbilities: [] as string[],
  improvements: Prisma.DbNull,
  effectBuffs: Prisma.DbNull,
  activationRequires: Prisma.DbNull,
  conditionImmunities: [] as string[],
  conditionImmunitiesRequireActiveBuff: null,
  conditionImmunitiesOnBuffStart: null,
};

function partitionKey(classId: string, subclassId: string | null): string {
  return `${classId}::${subclassId ?? "null"}`;
}

// Not staleCatalogRowsWhere: that builds an `edition: null` OR-branch Prisma
// rejects for this non-nullable column. Same per-edition partitioning,
// restricted to ClassFeature's two editions.
//
// A partition authoring zero rows for one edition builds `notIn: []`, which
// matches — and deletes — EVERY row of that edition. Safe only because
// pruneStalePartitions scopes `seeded` to one (classId, subclassId) partition
// before calling this.
function classFeatureStaleWhere(
  seeded: readonly { identity: string; edition: SeedEdition }[],
  extraWhere: { classId: string; subclassId: string | null },
) {
  const editions: SeedEdition[] = ["EDITION_2014", "EDITION_2024"];
  return {
    AND: [
      extraWhere,
      {
        OR: editions.map((edition) => ({
          edition,
          name: { notIn: seeded.filter((r) => r.edition === edition).map((r) => r.identity) },
        })),
      },
    ],
  };
}

interface ResolvedRow {
  classId: string;
  subclassId: string | null;
  row: ClassFeatureSeedRow;
}

async function resolveClassIdsByName(prisma: PrismaClient): Promise<Map<string, string>> {
  const classNames = [...new Set(CLASS_FEATURES.map((r) => r.className))];
  const classRows = await prisma.characterClass.findMany({
    where: { name: { in: classNames } },
    select: { id: true, name: true },
  });
  return new Map(classRows.map((c) => [c.name, c.id]));
}

async function resolveSubclassCandidatesBySlug(
  prisma: PrismaClient,
): Promise<Map<SubclassSlug, { id: string; edition: SeedEdition | null }[]>> {
  const slugs = [...new Set(CLASS_FEATURES.map((r) => r.subclassSlug).filter((s): s is SubclassSlug => s !== null))];
  const subclassRows = await prisma.subclass.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true, edition: true },
  });
  const bySlug = new Map<SubclassSlug, { id: string; edition: SeedEdition | null }[]>();
  for (const s of subclassRows) {
    const slug = s.slug as SubclassSlug;
    const arr = bySlug.get(slug) ?? [];
    arr.push({ id: s.id, edition: s.edition as SeedEdition | null });
    bySlug.set(slug, arr);
  }
  return bySlug;
}

// Subclass rows are edition-shared (edition: null) today; resolveEditionRow
// keeps this correct the day one forks. Split small (here and elsewhere in
// this file) to stay under the seed CC ceiling — prisma/seed/** has no
// coverage instrumentation, so CRAP floors at CC^2+CC regardless.
function resolveSubclassId(
  row: ClassFeatureSeedRow,
  subclassCandidatesBySlug: Map<SubclassSlug, { id: string; edition: SeedEdition | null }[]>,
): string | null {
  if (!row.subclassSlug) return null;
  const candidates = subclassCandidatesBySlug.get(row.subclassSlug) ?? [];
  const match = resolveEditionRow(candidates, row.edition);
  if (!match) {
    throw new Error(`seedClassFeatures: no Subclass row for slug "${row.subclassSlug}" (${row.edition})`);
  }
  return match.id;
}

function resolveOneRow(
  row: ClassFeatureSeedRow,
  classIdByName: Map<string, string>,
  subclassCandidatesBySlug: Map<SubclassSlug, { id: string; edition: SeedEdition | null }[]>,
): ResolvedRow {
  const classId = classIdByName.get(row.className);
  if (!classId) throw new Error(`seedClassFeatures: unknown class "${row.className}" in CLASS_FEATURES`);
  return { classId, subclassId: resolveSubclassId(row, subclassCandidatesBySlug), row };
}

function resolveRows(
  classIdByName: Map<string, string>,
  subclassCandidatesBySlug: Map<SubclassSlug, { id: string; edition: SeedEdition | null }[]>,
): ResolvedRow[] {
  return CLASS_FEATURES.map((row) => resolveOneRow(row, classIdByName, subclassCandidatesBySlug));
}

// Walks DESCRIPTOR_RESET's own key set (never a second hand-maintained list)
// and skips `undefined` values — spreading them would overwrite the reset's
// nulls with JS `undefined` instead of leaving the reset alone.
function authoredDescriptors(row: ClassFeatureSeedRow): Partial<typeof DESCRIPTOR_RESET> {
  const authored: Partial<Record<string, unknown>> = {};
  for (const key of Object.keys(DESCRIPTOR_RESET)) {
    const value = (row as unknown as Record<string, unknown>)[key];
    if (value !== undefined) authored[key] = value;
  }
  return authored as Partial<typeof DESCRIPTOR_RESET>;
}

async function writeResolvedRows(prisma: PrismaClient, resolved: ResolvedRow[]): Promise<void> {
  for (const { classId, subclassId, row } of resolved) {
    const descriptors = authoredDescriptors(row);
    const data = {
      classId,
      subclassId,
      name: row.name,
      level: row.level,
      description: row.description,
      edition: row.edition,
      ...DESCRIPTOR_RESET,
      ...descriptors,
    };
    await upsertEditionRow(
      prisma.classFeature,
      { classId, subclassId, name: row.name, edition: row.edition },
      data,
      { level: row.level, description: row.description, ...DESCRIPTOR_RESET, ...descriptors },
    );
  }
}

interface Partition {
  classId: string;
  subclassId: string | null;
  rows: ClassFeatureSeedRow[];
}

function groupByPartition(resolved: ResolvedRow[]): Map<string, Partition> {
  const byPartition = new Map<string, Partition>();
  for (const { classId, subclassId, row } of resolved) {
    const key = partitionKey(classId, subclassId);
    const entry = byPartition.get(key);
    if (entry) entry.rows.push(row);
    else byPartition.set(key, { classId, subclassId, rows: [row] });
  }
  return byPartition;
}

// Deletes, within EACH seeded partition, any row whose name isn't in that
// partition's own seeded list — see classFeatureStaleWhere's comment for the
// `notIn: []` scoping this depends on.
async function pruneStalePartitions(prisma: PrismaClient, byPartition: Map<string, Partition>): Promise<void> {
  for (const { classId, subclassId, rows } of byPartition.values()) {
    const staleWhere = classFeatureStaleWhere(
      rows.map((r) => ({ identity: r.name, edition: r.edition })),
      { classId, subclassId },
    );
    await prisma.classFeature.deleteMany({ where: staleWhere });
  }
}

// Deletes every row in a (classId, subclassId) partition the seed no longer
// authors AT ALL (e.g. a subclass removed from its class module) — these
// never appear in byPartition, so pruneStalePartitions never touches them.
async function sweepAbandonedPartitions(prisma: PrismaClient, byPartition: Map<string, Partition>): Promise<void> {
  const existingPartitions = await prisma.classFeature.findMany({
    select: { classId: true, subclassId: true },
    distinct: ["classId", "subclassId"],
  });
  const seededPartitionKeys = new Set(byPartition.keys());
  for (const p of existingPartitions) {
    if (!seededPartitionKeys.has(partitionKey(p.classId, p.subclassId))) {
      await prisma.classFeature.deleteMany({ where: { classId: p.classId, subclassId: p.subclassId } });
    }
  }
}

/**
 * Prunes stale rows scoped per (classId, subclassId) partition: many feature
 * names (Spellcasting, Extra Attack, ...) are shared across scopes, so a
 * global name-keyed prune could never retire a stale row while another scope
 * still seeds the same name.
 *
 * Uses find-then-write (upsertEditionRow), never `.upsert()` on the compound
 * key: subclassId is NULL for most rows, and Prisma rejects a literal null
 * inside a compound-unique `where` at runtime.
 */
export async function seedClassFeatures(prisma: PrismaClient): Promise<void> {
  const classIdByName = await resolveClassIdsByName(prisma);
  const subclassCandidatesBySlug = await resolveSubclassCandidatesBySlug(prisma);
  const resolved = resolveRows(classIdByName, subclassCandidatesBySlug);

  await writeResolvedRows(prisma, resolved);

  const byPartition = groupByPartition(resolved);
  await pruneStalePartitions(prisma, byPartition);
  await sweepAbandonedPartitions(prisma, byPartition);

  // The guards run LAST so they see the prune passes' own deletions — run
  // first they could not catch the very emptying they exist for (#1525/#1559).
  await assertEveryClassEditionPopulated(prisma);
  await assertEverySubclassEditionPopulated(prisma);
}

const EDITIONS: readonly SeedEdition[] = ["EDITION_2014", "EDITION_2024"];

// Below this, a (class, edition) pair reads as a half-written partition, not
// real content — a bare `>= 1` would sail past a half-write.
const MIN_ROWS_PER_PAIR = 10;

// Classes whose EDITION_2024 rows are still an unverified verbatim copy of
// their EDITION_2014 text: a class here must keep equal row counts per
// edition (ratchetFailure), and a retab removes it in the SAME diff that
// makes its editions genuinely diverge. Empty since the last retab (#1500,
// Monk); while empty the ratchet check is dead code — delete it together with
// this set, never before.
const EDITIONS_STILL_IDENTICAL = new Set<string>([]);

export interface ClassEditionPopulationSummary {
  pairsChecked: number;
  classRowCount: number;
  minPairCount: number;
  rowsCounted: number;
}

interface ClassPairCounts {
  name: string;
  perEdition: Map<SeedEdition, number>;
}

function collectClassPairCounts(
  classes: { id: string; name: string }[],
  countByPair: Map<string, number>,
): ClassPairCounts[] {
  return classes.map((cls) => {
    const perEdition = new Map<SeedEdition, number>();
    for (const edition of EDITIONS) perEdition.set(edition, countByPair.get(`${cls.id}::${edition}`) ?? 0);
    return { name: cls.name, perEdition };
  });
}

function pairCount(entry: ClassPairCounts, edition: SeedEdition): number {
  return entry.perEdition.get(edition) ?? 0;
}

function pairFloorFailure(name: string, edition: SeedEdition, count: number): string | null {
  if (count === 0) return `  ${name} / ${edition}: 0 rows (expected >= 1)`;
  if (count < MIN_ROWS_PER_PAIR) return `  ${name} / ${edition}: ${count} rows (below the >= ${MIN_ROWS_PER_PAIR} floor)`;
  return null;
}

function pairFloorFailures(entry: ClassPairCounts): string[] {
  const failures: string[] = [];
  for (const edition of EDITIONS) {
    const failure = pairFloorFailure(entry.name, edition, pairCount(entry, edition));
    if (failure) failures.push(failure);
  }
  return failures;
}

function ratchetFailure(entry: ClassPairCounts): string | null {
  if (!EDITIONS_STILL_IDENTICAL.has(entry.name)) return null;
  const c2014 = pairCount(entry, "EDITION_2014");
  const c2024 = pairCount(entry, "EDITION_2024");
  if (c2014 === c2024) return null;
  return (
    `  ${entry.name}: EDITION_2014 has ${c2014} rows but EDITION_2024 has ${c2024} rows — still listed in ` +
    `EDITIONS_STILL_IDENTICAL; remove it there in the same diff that makes this class's editions diverge on purpose`
  );
}

// Anti-vacuity summary (#1525) — a test asserts these counts independently of
// anything the guard itself could get wrong.
function summarizePairCounts(entries: ClassPairCounts[]): {
  pairsChecked: number;
  rowsCounted: number;
  minPairCount: number;
} {
  let pairsChecked = 0;
  let rowsCounted = 0;
  let minPairCount = Infinity;
  for (const entry of entries) {
    for (const edition of EDITIONS) {
      pairsChecked += 1;
      const count = pairCount(entry, edition);
      rowsCounted += count;
      if (count < minPairCount) minPairCount = count;
    }
  }
  return { pairsChecked, rowsCounted, minPairCount };
}

/**
 * Post-write presence guard (#1525): every seeded CharacterClass must have at
 * least MIN_ROWS_PER_PAIR ClassFeature rows in EACH edition — a missing
 * partition renders NO features at all, on a sheet that otherwise looks fine.
 * PRESENCE only, never correctness: "a row exists" and "the row is genuine
 * content for that edition" are different assertions.
 *
 * Anchored on `prisma.characterClass.findMany()` — the runtime truth — never
 * an in-memory class registry, which a migration can edit out of step.
 */
export async function assertEveryClassEditionPopulated(
  prisma: PrismaClient,
): Promise<ClassEditionPopulationSummary> {
  const classes = await prisma.characterClass.findMany({ select: { id: true, name: true } });
  const grouped = await prisma.classFeature.groupBy({ by: ["classId", "edition"], _count: { _all: true } });
  const countByPair = new Map<string, number>();
  for (const g of grouped) countByPair.set(`${g.classId}::${g.edition}`, g._count._all);

  const entries = collectClassPairCounts(classes, countByPair);
  const failures = entries.flatMap((entry) => {
    const ratchet = ratchetFailure(entry);
    return ratchet ? [...pairFloorFailures(entry), ratchet] : pairFloorFailures(entry);
  });

  if (failures.length > 0) {
    throw new Error(
      [
        "seedClassFeatures: ClassFeature population guard failed (#1525) —",
        ...failures,
        "Re-run `npx prisma db seed`. This guard asserts PRESENCE only, never that the",
        "2024 text is genuine 2024 content (#1528/#1227, #1134).",
      ].join("\n"),
    );
  }

  const { pairsChecked, rowsCounted, minPairCount } = summarizePairCounts(entries);
  return { pairsChecked, classRowCount: classes.length, minPairCount, rowsCounted };
}

// The editions a Subclass row is OFFERED for: `edition: null` is both, an
// exact tag is that one edition only (#1306's convention).
function offeredEditions(edition: SeedEdition | null): SeedEdition[] {
  return edition === null ? [...EDITIONS] : [edition];
}

// One seeded Subclass row, pre-joined for the pure check below — kept
// separate from the DB query so subclassPopulationFailures can be unit-tested
// against fabricated input.
export interface SubclassPresenceInput {
  slug: string;
  edition: SeedEdition | null;
  presentEditions: readonly SeedEdition[];
}

// A subclass offered for an edition missing from `presentEditions` is #1559's
// Totem Warrior bug, generalized — offered, but featureless once picked.
export function subclassPopulationFailures(rows: readonly SubclassPresenceInput[]): string[] {
  return rows.flatMap((row) =>
    offeredEditions(row.edition)
      .filter((offered) => !row.presentEditions.includes(offered))
      .map((offered) => `  ${row.slug} / ${offered}: 0 ClassFeature rows (expected >= 1)`),
  );
}

export interface SubclassEditionPopulationSummary {
  subclassesChecked: number;
  pairsChecked: number;
}

interface SubclassRowForPresence {
  id: string;
  slug: string;
  edition: SeedEdition | null;
}

function groupPresentEditionsBySubclassId(
  featureCounts: readonly { subclassId: string | null; edition: SeedEdition }[],
): Map<string, SeedEdition[]> {
  const bySubclassId = new Map<string, SeedEdition[]>();
  for (const f of featureCounts) {
    // Type narrowing only: the caller filters `subclassId: { in: [...] }` and
    // SQL's IN never matches NULL — but Prisma types the field string | null.
    if (!f.subclassId) continue;
    const present = bySubclassId.get(f.subclassId) ?? [];
    present.push(f.edition);
    bySubclassId.set(f.subclassId, present);
  }
  return bySubclassId;
}

function toSubclassPresenceInputs(
  subclassRows: readonly SubclassRowForPresence[],
  presentEditionsBySubclassId: Map<string, SeedEdition[]>,
): SubclassPresenceInput[] {
  return subclassRows.map((row) => ({
    slug: row.slug,
    edition: row.edition,
    presentEditions: presentEditionsBySubclassId.get(row.id) ?? [],
  }));
}

function throwSubclassPopulationFailure(failures: readonly string[]): never {
  throw new Error(
    [
      "seedClassFeatures: Subclass population guard failed (#1559) —",
      ...failures,
      "Every Subclass row must have at least one ClassFeature row in every edition it is",
      "offered for (edition: null offers both). Either author the missing ClassFeature",
      "rows, or tag the Subclass row's `edition` to the edition(s) it actually has content for.",
    ].join("\n"),
  );
}

/**
 * Post-seed presence guard (#1559): every seeded Subclass row must have at
 * least one ClassFeature row in every edition it is OFFERED for — otherwise a
 * character can pick it and land on a featureless sheet (Path of the Totem
 * Warrior's disclosure). PRESENCE only, same caveat as
 * assertEveryClassEditionPopulated.
 *
 * Scoped to slugs in SUBCLASSES — the seed's own emitted set — never a bare
 * table scan: a long-lived DB can hold a Subclass row the seed no longer
 * emits (reportUnseededSubclassRows owns those, #1562), and scanning it here
 * would fail the deploy for a problem this guard doesn't own.
 */
export async function assertEverySubclassEditionPopulated(
  prisma: PrismaClient,
): Promise<SubclassEditionPopulationSummary> {
  const seededSlugs = [...new Set(SUBCLASSES.map((s) => s.slug))];
  const subclassRows = await prisma.subclass.findMany({
    where: { slug: { in: seededSlugs } },
    select: { id: true, slug: true, edition: true },
  });
  const featureCounts = await prisma.classFeature.groupBy({
    by: ["subclassId", "edition"],
    where: { subclassId: { in: subclassRows.map((r) => r.id) } },
    _count: { _all: true },
  });

  const presentEditionsBySubclassId = groupPresentEditionsBySubclassId(featureCounts);
  const inputs = toSubclassPresenceInputs(
    subclassRows.map((row) => ({ id: row.id, slug: row.slug, edition: row.edition as SeedEdition | null })),
    presentEditionsBySubclassId,
  );
  const failures = subclassPopulationFailures(inputs);
  if (failures.length > 0) throwSubclassPopulationFailure(failures);

  const pairsChecked = inputs.reduce((n, r) => n + offeredEditions(r.edition).length, 0);
  return { subclassesChecked: subclassRows.length, pairsChecked };
}
