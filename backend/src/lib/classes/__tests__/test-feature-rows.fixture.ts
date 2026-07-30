// Test-only helper (#1524): builds the `ClassFeatureRowsCarrier` deriveResources'
// `featureRows` parameter expects, directly from the TS class/subclass
// definitions — the twelve lib/classes/<class>.ts modules stay the seed's
// AUTHORING input even though production now reads seeded rows instead
// (#1524's Fact 1). Lets every unit test that asserts on `.features` keep
// calling deriveResources with a bare class/subclass name (no DB round-trip)
// while still exercising the real read path (featuresFromRows). The DB-backed
// parity test (class-feature-parity.test.ts) is the proof this fixture and
// the seeded rows agree; if they ever diverge, that test — not this one —
// is what catches it.
import { barbarian } from "@/lib/classes/barbarian.js";
import { bard } from "@/lib/classes/bard.js";
import type { ClassFeatureRow, ClassFeatureRowsCarrier } from "@/lib/classes/class-feature-rows.js";
import { cleric } from "@/lib/classes/cleric.js";
import { druid } from "@/lib/classes/druid.js";
import { fighter } from "@/lib/classes/fighter.js";
import { monk } from "@/lib/classes/monk.js";
import { paladin } from "@/lib/classes/paladin.js";
import { ranger } from "@/lib/classes/ranger.js";
import { rogue } from "@/lib/classes/rogue.js";
import { sorcerer } from "@/lib/classes/sorcerer.js";
import type { AuthoredFeature, ClassDefinition, SubclassDefinition } from "@/lib/classes/types.js";
import { warlock } from "@/lib/classes/warlock.js";
import { wizard } from "@/lib/classes/wizard.js";

const TEST_CLASSES: Record<string, ClassDefinition> = {
  barbarian, bard, cleric, druid, fighter, monk, paladin, ranger, rogue, sorcerer, warlock, wizard,
};

// Flat map keyed by subclass name ACROSS all twelve classes, mirroring
// registry.ts's SUBCLASSES table — so testFeatureRowsFor("fighter", "life
// domain") would silently hand back Cleric rows, and any cross-class
// subclass-name collision resolves last-write-wins by TEST_CLASSES iteration
// order. Harmless here: this is a test-fixture convenience keyed the same way
// production's lookup table is (subclass names are unique across the seeded
// catalog today), and production itself never resolves a subclass this way —
// it goes through the FK relation (Character.subclassId), not a name lookup.
const TEST_SUBCLASSES: Record<string, SubclassDefinition> = {};
for (const classDef of Object.values(TEST_CLASSES)) {
  for (const [key, subclassDef] of Object.entries(classDef.subclasses ?? {})) {
    TEST_SUBCLASSES[key] = subclassDef;
  }
}

// Untagged (edition undefined) -> one row per edition, identical text;
// already-tagged -> exactly the one row its tag names. Mirrors
// prisma/seed/class-features.ts's expandFeatureRow — the write-time half of
// the same rule.
function toRows(features: AuthoredFeature[]): ClassFeatureRow[] {
  return features.flatMap((f) => {
    const editions = f.edition ? [f.edition] : (["EDITION_2014", "EDITION_2024"] as const);
    return editions.map((edition) => ({ name: f.name, level: f.level, description: f.description, edition }));
  });
}

/** The featureRows carrier for a (className, subclass) pair, sourced from the TS modules. */
export function testFeatureRowsFor(className: string, subclass: string | undefined): ClassFeatureRowsCarrier {
  const classDef = TEST_CLASSES[(className ?? "").toLowerCase()];
  const subDef = subclass ? TEST_SUBCLASSES[subclass.toLowerCase()] : undefined;
  return {
    classRows: toRows(classDef?.features ?? []),
    subclassRows: toRows(subDef?.features ?? []),
  };
}
