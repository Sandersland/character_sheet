// Proves the epic's no-migration AC for a later-printing floating-spread row
// (Astral Elf's Tasha's-era +2/+1-or-+1/+1/+1, MPMM/Spelljammer) — the schema
// must already hold this shape even though real Astral Elf content lands in a
// future wave-2 seed, not this slice. A dedicated fixture row, not a change to
// the real SPECIES roster: wave 1 is PHB parity only (species-data.test.ts
// pins the exact 9/10-row rosters), so this stays a test-authored row created
// and torn down here, never a seeded catalog entry.
import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

const FIXTURE_SLUG = "zzz-astral-elf-fixture-1679";

afterEach(async () => {
  await prisma.species.deleteMany({ where: { slug: FIXTURE_SLUG } });
});

describe("floating-spread species row (Astral Elf shape, #1679 no-migration AC)", () => {
  it("persists and round-trips a Species row whose abilityIncreases is a floating spread", async () => {
    const created = await prisma.species.create({
      data: {
        name: "Astral Elf (fixture)",
        slug: FIXTURE_SLUG,
        speed: 30,
        edition: "EDITION_2014",
        abilityIncreases: [{ floating: 3 }],
      },
    });

    const found = await prisma.species.findUniqueOrThrow({ where: { id: created.id } });
    expect(found.abilityIncreases).toEqual([{ floating: 3 }]);
  });
});
