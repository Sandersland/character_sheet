import { describe, expect, it } from "vitest";

import { prisma } from "./src/lib/core/prisma.js";
import {
  baseDatabaseUrl,
  templateDatabaseName,
  workerDatabaseName,
  workerDatabaseUrl,
} from "./vitest.db.js";

describe("per-worker test databases", () => {
  it("derives a distinct database per pool id from the base URL", () => {
    const base = "postgresql://u:p@db:5432/character_sheet";

    expect(workerDatabaseUrl(base, 3)).toBe("postgresql://u:p@db:5432/character_sheet_test_w3");
    expect(workerDatabaseName(base, 3)).toBe("character_sheet_test_w3");
    expect(templateDatabaseName(base)).toBe("character_sheet_test_template");
  });

  // Permanent guard against a "tidy-up" that turns vitest.setup.ts's dynamic
  // import of prisma back into a static one: that reverts every worker to the
  // ambient shared database and every other test still passes (#1269).
  it("runs against its own worker database, cloned from the seeded template", async () => {
    const [row] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;

    expect(row.db).toBe(workerDatabaseName(baseDatabaseUrl(), Number(process.env.VITEST_POOL_ID)));
    await expect(prisma.item.findUnique({ where: { name: "Longsword" } })).resolves.not.toBeNull();
  });
});
