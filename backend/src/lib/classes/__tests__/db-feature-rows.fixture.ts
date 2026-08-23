// Loads the real seeded ClassFeature rows for a (className, subclass) pair
// into the ClassFeatureRowsCarrier shape deriveResources expects.
import { prisma } from "@/lib/core/prisma.js";
import type { ClassFeatureRow, ClassFeatureRowsCarrier } from "@/lib/classes/class-feature-rows.js";
import { resolveSubclassSlug } from "@/lib/classes/subclass-slug.js";

function titleCase(className: string): string {
  return className.charAt(0).toUpperCase() + className.slice(1);
}

interface ResolvedClass {
  id: string;
  subclassLevel: number;
}

const classCache = new Map<string, ResolvedClass>();
const subclassIdCache = new Map<string, string>();

async function resolveClass(className: string): Promise<ResolvedClass> {
  const cached = classCache.get(className);
  if (cached) return cached;
  const row = await prisma.characterClass.findUniqueOrThrow({ where: { name: titleCase(className) } });
  const resolved: ResolvedClass = { id: row.id, subclassLevel: row.subclassLevel };
  classCache.set(className, resolved);
  return resolved;
}

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

export async function loadDbFeatureRows(className: string, subclass: string | undefined): Promise<ClassFeatureRowsCarrier> {
  const { id: classId, subclassLevel } = await resolveClass(className);
  // Prisma types these JSON columns as opaque JsonValue; cast to the tiered ClassFeatureRow shape.
  const classRows = (await prisma.classFeature.findMany({ where: { classId, subclassId: null } })) as unknown as ClassFeatureRow[];
  let subclassRows: ClassFeatureRow[] = [];
  if (subclass) {
    const subclassId = await resolveSubclassId(className, subclass);
    subclassRows = (await prisma.classFeature.findMany({ where: { classId, subclassId } })) as unknown as ClassFeatureRow[];
  }
  return { classRows, subclassRows, subclassLevel };
}
