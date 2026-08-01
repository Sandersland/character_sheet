// Test-only helper (#1528, extended #1546 Part B-i): Fighter's base resource
// pools (Second Wind/Action Surge/Indomitable) moved from a code resourceFn
// (keyed on className alone) onto ClassFeature rows tied to a SPECIFIC
// CharacterClass row's id. A test fixture that creates its own bespoke "Test
// Fighter" CharacterClass row (per testing.md — never mutate the real seeded
// catalog) therefore has NO matching ClassFeature children, so Second Wind/
// Action Surge silently vanish for that fixture unless it seeds them itself.
// This file is that seed — fighterResourceRowsData for the base class,
// battleMasterResourceRowsData below for the same gap on a bespoke Battle
// Master Subclass row.
//
// Derived from FIGHTER_BASE_ROWS (test-feature-rows.fixture.ts) rather than
// re-authoring the same descriptor values a second time: that fixture is
// already the one place a src-side test mirrors fighter-features.ts's
// content (the rootDir boundary — see its own header — means neither test
// file can import prisma/seed/fighter-features.ts directly), so deriving
// from it instead of hand-copying keeps this file from becoming a THIRD
// independent copy of the same data.
//
// Cascades on CharacterClass delete (ClassFeature.class has onDelete:
// Cascade) — a caller's own `characterClass.deleteMany` cleanup already
// removes these rows too; no separate teardown needed.
import type { Prisma } from "@/generated/prisma/client.js";
import { BATTLE_MASTER_ROWS, FIGHTER_BASE_ROWS } from "@/lib/classes/__tests__/test-feature-rows.fixture.js";

/** Second Wind / Action Surge / Indomitable rows for both editions, scoped to `classId`. */
export function fighterResourceRowsData(classId: string): Prisma.ClassFeatureCreateManyInput[] {
  // ClassFeatureRow's tiered fields (ResourceTotalTier[]/ResourceDieTier[])
  // are opaque Prisma.InputJsonValue on the write side, same rationale as
  // featureRowsOf's read-side cast (feature-rows-select.ts).
  return FIGHTER_BASE_ROWS.map((row) => ({ ...row, classId, subclassId: null })) as unknown as Prisma.ClassFeatureCreateManyInput[];
}

/**
 * Battle Master's own subclass rows (Combat Superiority, Student of War,
 * Know Your Enemy, Improved/Ultimate Combat Superiority, Relentless) for both
 * editions, scoped to a specific (classId, subclassId) pair (#1546 Part B-i,
 * Ruling 2). Every suite that builds its own bespoke Battle Master `Subclass`
 * row needs its own copy of these rows — same failure mode
 * fighterResourceRowsData's own header describes for the base class, now hit
 * a third time for the subclass — so this derives from BATTLE_MASTER_ROWS
 * (test-feature-rows.fixture.ts) the same way fighterResourceRowsData
 * derives from FIGHTER_BASE_ROWS, instead of each fixture hand-copying the
 * descriptor text again.
 */
export function battleMasterResourceRowsData(classId: string, subclassId: string): Prisma.ClassFeatureCreateManyInput[] {
  return BATTLE_MASTER_ROWS.map((row) => ({ ...row, classId, subclassId })) as unknown as Prisma.ClassFeatureCreateManyInput[];
}
