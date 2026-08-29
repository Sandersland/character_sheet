// fightingStyleFeatStep is mandatory whenever this delta is positive, so an empty offered set would hard-block level-up rather than degrade.
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { fightingStyleFeatOfferedForClasses } from "@/lib/srd/srd.js";
import type { RulesEdition } from "@character-sheet/shared-types";

import { CLASSES } from "../catalog-data.js";

const EDITIONS: RulesEdition[] = ["EDITION_2014", "EDITION_2024"];

describe("Fighting Style class gate (#1495) — offered set is never empty for a granting class", () => {
  const grantingClasses = CLASSES.filter((c) => c.fightingStyleFeatLevel != null);

  it("catalog-data.ts still names Fighter/Paladin/Ranger as the only Fighting Style-granting classes", () => {
    // Canary against a new granting class silently passing the AC below vacuously.
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
