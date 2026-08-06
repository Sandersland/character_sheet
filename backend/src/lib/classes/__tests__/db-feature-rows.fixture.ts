// Test-only helper (#1524): loads the REAL seeded ClassFeature rows
// (#1522/#1523) for a (className, subclass) pair into the
// `ClassFeatureRowsCarrier` shape `deriveResources` expects — the DB-backed
// counterpart to test-feature-rows.fixture.ts's TS-sourced one. Used by
// feature-edition.test.ts (the real-content sweep) and several per-class
// content suites (e.g. wizard-2024-content.test.ts); also fed
// class-feature-parity.test.ts's TS-vs-rows proof until #1675 retired that
// suite (it went vacuous the moment Monk, its last un-skipped class, joined
// LITERAL_ROW_CLASSES — literal-fixture-parity.test.ts, #1593, is the content-
// drift proof now).
import { prisma } from "@/lib/core/prisma.js";
import type { ClassFeatureRow, ClassFeatureRowsCarrier } from "@/lib/classes/class-feature-rows.js";
import { resolveSubclassSlug } from "@/lib/classes/subclass-slug.js";

// registry.ts's lowercase dispatch key -> the seeded CharacterClass.name
// (Title Case, single word for all twelve — prisma/seed/class-features.ts's
// own CLASS_MODULES mapping is the same shape).
function titleCase(className: string): string {
  return className.charAt(0).toUpperCase() + className.slice(1);
}

const classIdCache = new Map<string, string>();
const subclassIdCache = new Map<string, string>();

async function resolveClassId(className: string): Promise<string> {
  const cached = classIdCache.get(className);
  if (cached) return cached;
  const row = await prisma.characterClass.findUniqueOrThrow({ where: { name: titleCase(className) } });
  classIdCache.set(className, row.id);
  return row.id;
}

// Resolved via resolveSubclassSlug (subclass-slug.ts, #1277's sanctioned
// identity resolver) rather than a per-class TEST_CLASSES map of
// lib/classes/<class>.ts modules — the same resolver production now uses
// post-#1532, and it drops this fixture's dependence on every class module,
// not just the one being deleted. Never by display name, which can diverge
// from the registry key (e.g. "totem warrior" -> "Totem Warrior").
async function resolveSubclassId(className: string, subclass: string): Promise<string> {
  const cacheKey = `${className}|${subclass}`;
  const cached = subclassIdCache.get(cacheKey);
  if (cached) return cached;
  const slug = resolveSubclassSlug(className, { subclass });
  if (!slug) throw new Error(`db-feature-rows.fixture: no SubclassSlug for ${className}/${subclass}`);
  const row = await prisma.subclass.findFirstOrThrow({ where: { slug } });
  subclassIdCache.set(cacheKey, row.id);
  return row.id;
}

/**
 * Loads the real seeded ClassFeature rows (both editions — mirrors
 * characterInclude, which can't filter by edition either) for one
 * (className, subclass) pair into the carrier `deriveResources` expects.
 */
export async function loadDbFeatureRows(className: string, subclass: string | undefined): Promise<ClassFeatureRowsCarrier> {
  const classId = await resolveClassId(className);
  // Prisma types resourceTotals/resourceDieTiers/derivedStatTiers as opaque
  // Prisma.JsonValue — cast to ClassFeatureRow's tiered shape here, mirroring
  // feature-rows-select.ts's featureRowsOf (#1528).
  const classRows = (await prisma.classFeature.findMany({ where: { classId, subclassId: null } })) as unknown as ClassFeatureRow[];
  let subclassRows: ClassFeatureRow[] = [];
  if (subclass) {
    const subclassId = await resolveSubclassId(className, subclass);
    subclassRows = (await prisma.classFeature.findMany({ where: { classId, subclassId } })) as unknown as ClassFeatureRow[];
  }
  return { classRows, subclassRows };
}
