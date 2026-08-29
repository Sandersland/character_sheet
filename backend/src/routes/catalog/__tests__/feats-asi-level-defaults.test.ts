import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-feats-asi-defaults-1438";
let COOKIE: string;

const GENERAL_DEFAULT = "General No-Prereq Feat (asiLevel Suite)";
const GENERAL_AT_EIGHT = "General Level-Eight Feat (asiLevel Suite)";
const BOON_DEFAULT = "Boon No-Prereq Feat (asiLevel Suite)";
const FIXTURE_NAMES = [GENERAL_DEFAULT, GENERAL_AT_EIGHT, BOON_DEFAULT];

beforeAll(async () => {
  COOKIE = await authCookie(OWNER_ID);

  await upsertEditionRow(
    prisma.feat,
    { name: GENERAL_DEFAULT, edition: null },
    { name: GENERAL_DEFAULT, description: "General, no levelPrerequisite.", category: "general" },
    { category: "general", levelPrerequisite: null },
  );
  await upsertEditionRow(
    prisma.feat,
    { name: GENERAL_AT_EIGHT, edition: null },
    { name: GENERAL_AT_EIGHT, description: "General from level 8.", category: "general", levelPrerequisite: 8 },
    { category: "general", levelPrerequisite: 8 },
  );
  await upsertEditionRow(
    prisma.feat,
    { name: BOON_DEFAULT, edition: null },
    { name: BOON_DEFAULT, description: "Epic Boon, no levelPrerequisite.", category: "epic_boon" },
    { category: "epic_boon", levelPrerequisite: null },
  );
});

afterAll(async () => {
  await prisma.feat.deleteMany({ where: { name: { in: FIXTURE_NAMES } } });
});

describe("GET /api/feats?asiLevel= — category defaults and row overrides (#1438)", () => {
  async function namesAt(asiLevel: number): Promise<string[]> {
    const res = await supertest(app)
      .get(`/api/feats?edition=EDITION_2024&asiLevel=${asiLevel}`)
      .set("Cookie", COOKIE);
    expect(res.status).toBe(200);
    return res.body.map((f: { name: string }) => f.name);
  }

  it("applies the General category default of 4 to a NULL levelPrerequisite", async () => {
    expect(await namesAt(3)).not.toContain(GENERAL_DEFAULT);
    expect(await namesAt(4)).toContain(GENERAL_DEFAULT);
  });

  it("uses the row's own levelPrerequisite, not the category default", async () => {
    const atFour = await namesAt(4);
    expect(atFour).toContain(GENERAL_DEFAULT);
    expect(atFour).not.toContain(GENERAL_AT_EIGHT);
    expect(await namesAt(7)).not.toContain(GENERAL_AT_EIGHT);
    expect(await namesAt(8)).toContain(GENERAL_AT_EIGHT);
  });

  it("applies the Epic Boon category default of 19 to a NULL levelPrerequisite", async () => {
    expect(await namesAt(18)).not.toContain(BOON_DEFAULT);
    expect(await namesAt(19)).toContain(BOON_DEFAULT);
  });

  it("serves all three fixtures when ?asiLevel= is absent", async () => {
    const res = await supertest(app)
      .get("/api/feats?edition=EDITION_2024")
      .set("Cookie", COOKIE);
    expect(res.status).toBe(200);
    const names = res.body.map((f: { name: string }) => f.name);
    for (const fixture of FIXTURE_NAMES) expect(names).toContain(fixture);
  });
});
