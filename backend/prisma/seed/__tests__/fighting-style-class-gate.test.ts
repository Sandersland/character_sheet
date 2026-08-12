// AC (#1495, 2026-08-03 issue comment #4): for every (class, edition) with
// fightingStyleFeatLevel != null, the offered Fighting Style set must be
// NON-EMPTY — asserted against the REAL seeded catalog, not assumed. The
// level-up ceremony's fightingStyleFeatStep (level-up-plan.ts) is mandatory
// whenever this delta is positive, so a gate that empties the offered set
// would hard-block level-up rather than degrade.
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { fightingStyleFeatOfferedForClasses } from "@/lib/srd/srd.js";
import type { RulesEdition } from "@character-sheet/shared-types";

import { CLASSES } from "../catalog-data.js";

const EDITIONS: RulesEdition[] = ["EDITION_2014", "EDITION_2024"];

describe("Fighting Style class gate (#1495) — offered set is never empty for a granting class", () => {
  const grantingClasses = CLASSES.filter((c) => c.fightingStyleFeatLevel != null);

  it("catalog-data.ts still names Fighter/Paladin/Ranger as the only Fighting Style-granting classes", () => {
    // Not a hard requirement of the rule itself, but a canary: if a new class
    // gains fightingStyleFeatLevel later, this test's own list below (and the
    // seeded Feat.classes rows) need a matching update or the AC below could
    // pass vacuously for the wrong reason.
    expect(grantingClasses.map((c) => c.name).sort()).toEqual(["Fighter", "Paladin", "Ranger"]);
  });

  for (const edition of EDITIONS) {
    it(`edition=${edition}: every Fighting Style-granting class is offered at least one style`, async () => {
      const feats = await prisma.feat.findMany({
        where: { category: "fighting_style", OR: [{ edition }, { edition: null }] },
        select: { classes: true },
      });
      expect(feats.length).toBeGreaterThan(0);

      for (const cls of grantingClasses) {
        const offeredCount = feats.filter((f) =>
          fightingStyleFeatOfferedForClasses(f, [cls.name], edition),
        ).length;
        expect(offeredCount, `${cls.name} (${edition})`).toBeGreaterThan(0);
      }
    });
  }
});
