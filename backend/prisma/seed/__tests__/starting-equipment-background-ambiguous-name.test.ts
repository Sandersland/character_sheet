// DB-backed proof for #1565's reviewer fix: Background is @@unique([name,
// edition]), so a name can legitimately own up to three rows (NULL/2014/2024).
// resolveBackgroundIdsByName's `findMany` keyed a Map by NAME alone — when
// two rows shared a name, the later one silently won and the earlier row's
// package (if any) would misfile onto the wrong background with no error.
// This is dormant today (every seeded background name resolves to exactly
// one row), but the open owner decision this issue names — forking
// Charlatan/Folk Hero/Noble to EDITION_2014, or #1348 generally — would hit
// it silently the moment any forked background also carries a package.
//
// A transient fixture Background (never a real seeded name), cleaned up in
// afterEach regardless of pass/fail — same isolation shape
// starting-equipment-fork-reseed.test.ts uses for its real-row Warlock probe,
// adapted here since this hazard needs a row that does NOT exist in the real
// catalog at all (a genuine name collision, not a real seeded one).
import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import { resolveBackgroundIdsByName } from "../seed-starting-equipment.js";

const AMBIGUOUS_NAME = "Test Ambiguous Background (#1565)";

afterEach(async () => {
  await prisma.background.deleteMany({ where: { name: AMBIGUOUS_NAME } });
});

describe("resolveBackgroundIdsByName — ambiguous name guard (#1565)", () => {
  it("throws, naming the background and both editions found, when a name resolves to more than one row", async () => {
    await prisma.background.create({
      data: { name: AMBIGUOUS_NAME, skillProficiencies: [], edition: "EDITION_2014" },
    });
    await prisma.background.create({
      data: { name: AMBIGUOUS_NAME, skillProficiencies: [], edition: "EDITION_2024" },
    });

    await expect(resolveBackgroundIdsByName(prisma, [AMBIGUOUS_NAME])).rejects.toThrow(
      /Test Ambiguous Background \(#1565\)/,
    );
    await expect(resolveBackgroundIdsByName(prisma, [AMBIGUOUS_NAME])).rejects.toThrow(/EDITION_2014/);
    await expect(resolveBackgroundIdsByName(prisma, [AMBIGUOUS_NAME])).rejects.toThrow(/EDITION_2024/);
  });

  it("still resolves cleanly when every queried name has exactly one row (the real seeded shape)", async () => {
    const result = await resolveBackgroundIdsByName(prisma, ["Acolyte", "Criminal"]);
    expect(result.get("Acolyte")).toBeDefined();
    expect(result.get("Criminal")).toBeDefined();
  });
});
