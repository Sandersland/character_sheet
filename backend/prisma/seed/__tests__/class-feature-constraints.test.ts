// DB-backed proof for #1523's NULLS NOT DISTINCT clause on
// ClassFeature(classId, subclassId, name, edition) — hand-written because
// Prisma's DSL cannot express it (20260730120000_add_class_feature).
//
// Unlike catalog-edition-constraints.test.ts's Feat/GrantedAbility proofs
// (where `edition` is the nullable column NULLS NOT DISTINCT protects),
// ClassFeature's `edition` is NON-NULLABLE — every row forks (#1522 decision).
// The nullable column here is `subclassId` (NULL = base-class feature, the
// MAJORITY of the 522 rows), so this file's probe is a same-(class, NULL
// subclass, name, edition) duplicate, not a same-name/null-edition one.
import { afterEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";

const NAME = "Zzz NULLS-NOT-DISTINCT ClassFeature Probe (#1523)";

describe("NULLS NOT DISTINCT — ClassFeature(classId, subclassId, name, edition) rejects a duplicate base-class row", () => {
  afterEach(async () => {
    await prisma.classFeature.deleteMany({ where: { name: NAME } });
  });

  it("a second (fighter, NULL subclass, name, EDITION_2024) row is rejected by the database (P2002)", async () => {
    const fighter = await prisma.characterClass.findUniqueOrThrow({ where: { name: "Fighter" } });

    await prisma.classFeature.create({
      data: { classId: fighter.id, subclassId: null, name: NAME, level: 1, description: "first", edition: "EDITION_2024" },
    });

    let error: unknown;
    try {
      await prisma.classFeature.create({
        data: { classId: fighter.id, subclassId: null, name: NAME, level: 1, description: "second", edition: "EDITION_2024" },
      });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2002");
  });

  it("the SAME name under a DIFFERENT subclass is allowed — subclassId is part of the key, not just a filter", async () => {
    const fighter = await prisma.characterClass.findUniqueOrThrow({ where: { name: "Fighter" } });
    const champion = await prisma.subclass.findFirstOrThrow({ where: { slug: "fighter-champion" } });

    await prisma.classFeature.create({
      data: { classId: fighter.id, subclassId: null, name: NAME, level: 1, description: "base-class", edition: "EDITION_2024" },
    });
    await prisma.classFeature.create({
      data: { classId: fighter.id, subclassId: champion.id, name: NAME, level: 3, description: "champion", edition: "EDITION_2024" },
    });

    const rows = await prisma.classFeature.findMany({ where: { name: NAME } });
    expect(rows).toHaveLength(2);
  });

  it("the SAME (class, NULL subclass, name) under a DIFFERENT edition is allowed — edition is part of the key", async () => {
    const fighter = await prisma.characterClass.findUniqueOrThrow({ where: { name: "Fighter" } });

    await prisma.classFeature.create({
      data: { classId: fighter.id, subclassId: null, name: NAME, level: 1, description: "2014", edition: "EDITION_2014" },
    });
    await prisma.classFeature.create({
      data: { classId: fighter.id, subclassId: null, name: NAME, level: 1, description: "2024", edition: "EDITION_2024" },
    });

    const rows = await prisma.classFeature.findMany({ where: { name: NAME } });
    expect(rows.map((r) => r.edition).sort()).toEqual(["EDITION_2014", "EDITION_2024"]);
  });
});
