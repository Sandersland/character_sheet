// --- ClassFeature seeder (#1522/#1523) ---------------------------------------
// The executable counterpart to class-features.ts's DATA (CLASS_FEATURES) —
// split out per #1277 AC 4 / scripts/check-seed-data-modules.sh, which forbids
// prisma/upsert/await logic in a seed DATA module. Mirrors spells.ts /
// rename-spells.ts's existing content/logic split.
import { Prisma, type PrismaClient } from "../../src/generated/prisma/client.js";
import { upsertEditionRow, resolveEditionRow } from "../../src/lib/rules/catalog-edition.js";
import type { SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { SeedEdition } from "./edition.js";
import { CLASS_FEATURES, type ClassFeatureSeedRow } from "./class-features.js";

// Every descriptor column reset to NULL/default — the literal "populated
// nowhere" state #1523's acceptance criteria pin. Spread onto every row this
// seeder writes; #1528 is what first overrides any of these per-row. The
// three Json? columns use Prisma.JsonNull (never a bare `null`): Prisma's
// generated CreateInput type for a nullable Json field only accepts
// InputJsonValue | NullableJsonNullValueInput, rejecting a literal `null` at
// compile time — the same JSON-column idiom `spellcasting: Prisma.JsonNull`
// uses elsewhere in this codebase.
const DESCRIPTOR_RESET = {
  resourceKey: null,
  resourceLabel: null,
  resourceRecharge: null,
  resourceTotals: Prisma.JsonNull,
  resourceDieTiers: Prisma.JsonNull,
  activationCost: null,
  resolverKind: null,
  requiresUnarmored: false,
  regrants: [] as string[],
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
  derivedStatTiers: Prisma.JsonNull,
};

function partitionKey(classId: string, subclassId: string | null): string {
  return `${classId}::${subclassId ?? "null"}`;
}

// staleCatalogRowsWhere (prune.ts) always builds a THIRD `edition: null`
// OR-branch, because every one of its existing callers (Feat/GrantedAbility/
// Action) has a nullable `edition` column where NULL means "shared".
// ClassFeature.edition is deliberately NON-NULLABLE (#1522 decision: every row
// forks) — verified empirically running `npx prisma db seed` end-to-end:
// Prisma's generated WhereInput for a non-nullable column rejects a literal
// `edition: null` filter outright ("Argument `edition` is missing"), so the
// shared helper's null branch cannot be handed to this model at all. This
// reproduces the SAME per-edition partitioning staleCatalogRowsWhere does,
// restricted to the two editions ClassFeature can actually hold, rather than
// widening the shared helper to special-case a column shape none of its other
// callers has.
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

// Every seeded Subclass row has edition: null today (no subclass forks yet,
// #1306), so both a row's 2014 and 2024 ClassFeature point at the SAME
// Subclass row — correct, and it costs this function nothing to stay correct
// the day a subclass DOES fork, since resolveEditionRow is what's doing the
// resolving, not a bare find. Split out of resolveOneRow (below) purely to
// keep each function's cyclomatic complexity low — see collectRawFeatures'
// comment in class-features.ts on why prisma/seed/** floors at the UNCOVERED
// CRAP formula regardless of real test coverage.
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

async function writeResolvedRows(prisma: PrismaClient, resolved: ResolvedRow[]): Promise<void> {
  for (const { classId, subclassId, row } of resolved) {
    const data = {
      classId,
      subclassId,
      name: row.name,
      level: row.level,
      description: row.description,
      edition: row.edition,
      ...DESCRIPTOR_RESET,
    };
    await upsertEditionRow(
      prisma.classFeature,
      { classId, subclassId, name: row.name, edition: row.edition },
      data,
      { level: row.level, description: row.description, ...DESCRIPTOR_RESET },
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
// partition's own seeded list (#1227's "removed in 2024 = do not author a
// 2024 row" case — see classFeatureStaleWhere's comment for why a global
// name-scoped prune can't do this).
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
 * Seeds every ClassFeature row (#1522/#1523) and prunes stale ones, scoped per
 * (classId, subclassId) partition rather than globally: a global name-keyed
 * prune (the shape staleCatalogRowsWhere gives its other callers) keys on
 * `name` alone, but 12 feature names (Spellcasting x7, Extra Attack x6,
 * Fighting Style/Oath Spells/Expanded Spell List/Bonus Proficiencies x3 each,
 * plus six more x2) are shared across more than one (class, subclass) scope,
 * so a globally-scoped prune could never retire a stale row for those names
 * while another class/subclass still seeds the same name (#1227).
 *
 * Exported (not module-private like every other seed.ts family) so a test can
 * call it twice in-process and assert idempotency — see
 * granted-ability-fork-reseed.test.ts's header on why seed.ts's own families
 * can't be re-run this way.
 *
 * Uses find-then-write (upsertEditionRow), never `.upsert()`/`.findUnique()`
 * on the compound key: subclassId is NULL for the majority of rows, and
 * Prisma rejects a literal null inside a compound-unique `where` at runtime
 * (verified against the structurally identical Subclass.classId_name key —
 * see upsertEditionRow's JSDoc).
 */
export async function seedClassFeatures(prisma: PrismaClient): Promise<void> {
  const classIdByName = await resolveClassIdsByName(prisma);
  const subclassCandidatesBySlug = await resolveSubclassCandidatesBySlug(prisma);
  const resolved = resolveRows(classIdByName, subclassCandidatesBySlug);

  await writeResolvedRows(prisma, resolved);

  const byPartition = groupByPartition(resolved);
  await pruneStalePartitions(prisma, byPartition);
  await sweepAbandonedPartitions(prisma, byPartition);
}
