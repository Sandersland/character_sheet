// Test-only helper (#1524): loads the REAL seeded ClassFeature rows
// (#1522/#1523) for a (className, subclass) pair into the
// `ClassFeatureRowsCarrier` shape `deriveResources` expects — the DB-backed
// counterpart to test-feature-rows.fixture.ts's TS-sourced one. Shared by
// feature-edition.test.ts (the real-content sweep) and
// class-feature-parity.test.ts (the TS-vs-rows proof), both of which need the
// SAME resolution: className -> CharacterClass row, subclass key -> its
// SubclassDefinition.slug -> the matching Subclass row.
import { prisma } from "@/lib/core/prisma.js";
import type { ClassFeatureRow, ClassFeatureRowsCarrier } from "@/lib/classes/class-feature-rows.js";

import { barbarian } from "@/lib/classes/barbarian.js";
import { bard } from "@/lib/classes/bard.js";
import { cleric } from "@/lib/classes/cleric.js";
import { druid } from "@/lib/classes/druid.js";
import { fighter } from "@/lib/classes/fighter.js";
import { monk } from "@/lib/classes/monk.js";
import { paladin } from "@/lib/classes/paladin.js";
import { ranger } from "@/lib/classes/ranger.js";
import { rogue } from "@/lib/classes/rogue.js";
import { sorcerer } from "@/lib/classes/sorcerer.js";
import type { ClassDefinition } from "@/lib/classes/types.js";
import { warlock } from "@/lib/classes/warlock.js";
import { wizard } from "@/lib/classes/wizard.js";

const TEST_CLASSES: Record<string, ClassDefinition> = {
  barbarian, bard, cleric, druid, fighter, monk, paladin, ranger, rogue, sorcerer, warlock, wizard,
};

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

// Resolved via SubclassDefinition.slug (the stable identity join, #1277) —
// never by display name, which can diverge from the registry key (e.g.
// "totem warrior" -> "Totem Warrior").
async function resolveSubclassId(className: string, subclass: string): Promise<string> {
  const cacheKey = `${className}|${subclass}`;
  const cached = subclassIdCache.get(cacheKey);
  if (cached) return cached;
  const classDef = TEST_CLASSES[className.toLowerCase()];
  const subDef = classDef?.subclasses?.[subclass.toLowerCase()];
  if (!subDef) throw new Error(`db-feature-rows.fixture: no SubclassDefinition for ${className}/${subclass}`);
  const row = await prisma.subclass.findFirstOrThrow({ where: { slug: subDef.slug } });
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
  const classRows = await prisma.classFeature.findMany({ where: { classId, subclassId: null } });
  let subclassRows: ClassFeatureRow[] = [];
  if (subclass) {
    const subclassId = await resolveSubclassId(className, subclass);
    subclassRows = await prisma.classFeature.findMany({ where: { classId, subclassId } });
  }
  return { classRows, subclassRows };
}
