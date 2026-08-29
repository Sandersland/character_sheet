// A bespoke CharacterClass row (e.g. "Test Fighter") has no matching ClassFeature rows — they're keyed to a specific CharacterClass id — so a fixture needs fighterResourceRowsData/battleMasterResourceRowsData below to seed them.
// Derived from FIGHTER_BASE_ROWS/BATTLE_MASTER_ROWS instead of re-authoring so this file doesn't become a second copy of that content.
// ClassFeature.class has onDelete: Cascade, so a caller's own characterClass.deleteMany cleanup already removes these rows — no separate teardown needed.
import type { Prisma } from "@/generated/prisma/client.js";
import { BATTLE_MASTER_ROWS, FIGHTER_BASE_ROWS } from "@/lib/classes/__tests__/test-feature-rows.fixture.js";

export function fighterResourceRowsData(classId: string): Prisma.ClassFeatureCreateManyInput[] {
  // ClassFeatureRow's tiered fields are opaque Prisma.InputJsonValue on the write side, same rationale as featureRowsOf's read-side cast.
  return FIGHTER_BASE_ROWS.map((row) => ({ ...row, classId, subclassId: null })) as unknown as Prisma.ClassFeatureCreateManyInput[];
}

export function battleMasterResourceRowsData(classId: string, subclassId: string): Prisma.ClassFeatureCreateManyInput[] {
  return BATTLE_MASTER_ROWS.map((row) => ({ ...row, classId, subclassId })) as unknown as Prisma.ClassFeatureCreateManyInput[];
}
