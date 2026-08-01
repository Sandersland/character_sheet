// #1524 AC 1(2): DB-backed parity proof that switching the derivation from
// the twelve TS class modules onto seeded ClassFeature rows changed NO
// content. This is available ONLY at this stage, while both sources still
// exist side by side — comment here (and on featureAppliesToEdition's
// replacement) that it MUST be replaced once the TS arrays are finally
// retired as the source of truth (they remain the seed's AUTHORING input
// after this stage — #1524's Fact 1 — so this test can keep running until
// that retirement, not just today).
//
// "OLD" side: reimplements registry.ts's PRE-#1524 filter inline, straight off
// the TS ClassDefinition/SubclassDefinition objects — the exact
// featureAppliesToEdition + mergeLayers logic this issue retired. "NEW" side:
// the REAL deriveResources, fed the REAL seeded ClassFeature rows via
// loadDbFeatureRows. Every class x subclass (+ no-subclass) x level 1-20 x
// both editions.
import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
import { subclassActiveAt } from "@/lib/leveling/effective-levels.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import type { AuthoredFeature, ClassDefinition } from "@/lib/classes/types.js";

import { bard } from "@/lib/classes/bard.js";
import { cleric } from "@/lib/classes/cleric.js";
import { druid } from "@/lib/classes/druid.js";
import { monk } from "@/lib/classes/monk.js";
import { paladin } from "@/lib/classes/paladin.js";
import { ranger } from "@/lib/classes/ranger.js";
import { sorcerer } from "@/lib/classes/sorcerer.js";
import { warlock } from "@/lib/classes/warlock.js";
import { wizard } from "@/lib/classes/wizard.js";

import { CLASS_SUBCLASSES, LITERAL_ROW_CLASSES } from "./class-subclasses.fixture.js";
import { loadDbFeatureRows } from "./db-feature-rows.fixture.js";

// Fighter, Barbarian and Rogue deliberately absent (#1227/#1532, #1223,
// #1231): `lib/classes/fighter.ts`, `lib/classes/barbarian.ts` and
// `lib/classes/rogue.ts` no longer exist at all (features moved to literal
// seed data, fighter-features.ts/barbarian-features.ts/rogue-features.ts),
// so `oldDeriveFeatures`'s TS-derived "OLD" side has no ClassDefinition left
// to read `classDef?.features` from — comparing that against the real
// rows-fed "NEW" side would fail on content this migration deliberately
// changed, not a regression. See LITERAL_ROW_CLASSES' comment for why this
// header's own reminder ("MUST be replaced once the TS arrays are finally
// retired") is now true for all three; the other nine classes still need it.
const REFERENCE_CLASSES: Record<string, ClassDefinition> = {
  bard, cleric, druid, monk, paladin, ranger, sorcerer, warlock, wizard,
};

const ABILITY_SCORES = {
  strength: 14,
  dexterity: 16,
  constitution: 12,
  intelligence: 10,
  wisdom: 13,
  charisma: 15,
};

type RulesEditionLiteral = "EDITION_2014" | "EDITION_2024";

// The retired featureAppliesToEdition, reimplemented here ONLY as the "OLD"
// side's reference — never imported from production (the function itself is
// gone). Absent `edition` on an AuthoredFeature means "both editions".
function appliesToEdition(feature: AuthoredFeature, edition: RulesEditionLiteral): boolean {
  return feature.edition === undefined || feature.edition === edition;
}

interface OldFeature {
  name: string;
  level: number;
  description: string;
  source: "class" | "subclass";
}

// The exact pre-#1524 deriveBaseLayer + deriveSubclassLayer + mergeLayers
// pipeline, read straight off the TS definitions — no seeded rows involved.
function oldDeriveFeatures(className: string, subclass: string | undefined, level: number, edition: RulesEditionLiteral): OldFeature[] {
  const classDef = REFERENCE_CLASSES[className.toLowerCase()];
  const baseFeatures = (classDef?.features ?? []).filter((f) => f.level <= level && appliesToEdition(f, edition));

  let subFeatures: AuthoredFeature[] = [];
  if (subclass) {
    const subDef = classDef?.subclasses?.[subclass.toLowerCase()];
    if (subDef && subclassActiveAt(level, subDef.grantLevel, edition)) {
      subFeatures = (subDef.features ?? []).filter((f) => f.level <= level && appliesToEdition(f, edition));
    }
  }

  return [...baseFeatures, ...subFeatures]
    .map(({ name, level: lvl, description, source }) => ({ name, level: lvl, description, source }))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

// The NEW rows-fed side, projected to the same shape (dropping the required
// `edition` DerivedFeature now carries — the OLD side never had one).
function newDeriveFeatures(
  className: string,
  subclass: string | undefined,
  level: number,
  profBonus: number,
  featureRows: Awaited<ReturnType<typeof loadDbFeatureRows>>,
  edition: RulesEditionLiteral,
): OldFeature[] {
  const info = deriveResources(className, subclass, level, ABILITY_SCORES, profBonus, featureRows, edition);
  return (info?.features ?? []).map(({ name, level: lvl, description, source }) => ({ name, level: lvl, description, source }));
}

describe("class-feature-parity (#1524): TS-fed derivation vs seeded-rows-fed derivation are identical", () => {
  for (const [className, subclasses] of Object.entries(CLASS_SUBCLASSES)) {
    // Fighter is retired from this comparison (#1227) — see the file header
    // and LITERAL_ROW_CLASSES' comment (class-subclasses.fixture.ts).
    if (LITERAL_ROW_CLASSES.has(className)) continue;
    for (const subclass of subclasses) {
      it(`${className} / ${subclass ?? "(no subclass)"} — every level 1-20, both editions`, async () => {
        const featureRows = await loadDbFeatureRows(className, subclass);
        for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
          for (let level = 1; level <= 20; level++) {
            const profBonus = proficiencyBonusForLevel(level);
            const old = oldDeriveFeatures(className, subclass, level, edition);
            const rowsFed = newDeriveFeatures(className, subclass, level, profBonus, featureRows, edition);
            expect(rowsFed, `${className}/${subclass}/L${level}/${edition}`).toEqual(old);
          }
        }
      });
    }
  }
});
