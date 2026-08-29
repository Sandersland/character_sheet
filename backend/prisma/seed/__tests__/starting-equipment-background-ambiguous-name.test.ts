// Background is @@unique([name, edition]); a name can legitimately own up to three rows (NULL/2014/2024).
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
