/**
 * GET /api/feats edition-aware resolution (#1306, made required by #1411).
 * `?edition=` is mandatory: an absent one and an unrecognized one both 400,
 * and both assert their message — two 400s are not distinguishable by status
 * alone, and the whole point of the required param is that a caller learns
 * which mistake it made. The 2014/2024/Grappler cases are unchanged from
 * #1306 on purpose: they are the proof that making the param required left
 * resolveEditionCatalog's exact-then-shared resolution undisturbed.
 */
import { beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-feats-edition-1306";
let COOKIE: string;

beforeAll(async () => {
  COOKIE = await authCookie(OWNER_ID);
});

describe("GET /api/feats — edition resolution (#1306)", () => {
  it("without ?edition=, 400s rather than serving a flat cross-edition catalog", async () => {
    const res = await supertest(app).get("/api/feats").set("Cookie", COOKIE);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Missing required query parameter: edition");
  });

  it("?edition=EDITION_2014 resolves to exactly one Alert row: the flat +5 variant", async () => {
    const res = await supertest(app).get("/api/feats?edition=EDITION_2014").set("Cookie", COOKIE);
    expect(res.status).toBe(200);

    const alerts = res.body.filter((f: { name: string }) => f.name === "Alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].improvements).toEqual([{ target: "initiative", amount: 5 }]);
  });

  it("?edition=EDITION_2024 resolves to exactly one Alert row: the +PB variant", async () => {
    const res = await supertest(app).get("/api/feats?edition=EDITION_2024").set("Cookie", COOKIE);
    expect(res.status).toBe(200);

    const alerts = res.body.filter((f: { name: string }) => f.name === "Alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].improvements).toEqual([{ target: "initiative", amount: 1, scaling: "proficiencyBonus" }]);
  });

  it("either edition resolves Grappler to the same single shared row", async () => {
    const res2014 = await supertest(app).get("/api/feats?edition=EDITION_2014").set("Cookie", COOKIE);
    const res2024 = await supertest(app).get("/api/feats?edition=EDITION_2024").set("Cookie", COOKIE);

    const grappler2014 = res2014.body.find((f: { name: string }) => f.name === "Grappler");
    const grappler2024 = res2024.body.find((f: { name: string }) => f.name === "Grappler");
    expect(grappler2014.id).toBe(grappler2024.id);
  });

  it("an unrecognized ?edition= value 400s with a message distinct from the missing-param one", async () => {
    const res = await supertest(app).get("/api/feats?edition=bogus").set("Cookie", COOKIE);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^Unknown edition: /);
  });
});

/**
 * Every case here runs against the REAL SEEDED catalog (backend/prisma/seed/feats.ts)
 * — no fixture rows, which is why it can assert absolute category counts. The
 * `?? 4` / `?? 19` category defaults are unreachable from the seed (all 19 general
 * rows carry an explicit levelPrerequisite 4 and all 7 epic_boon rows an explicit
 * 19), so those branches are covered by the fixture rows in
 * feats-asi-level-defaults.test.ts instead.
 */
describe("GET /api/feats?asiLevel= — server-side ASI eligibility (#1438)", () => {
  async function get(query: string): Promise<{ name: string; category: string }[]> {
    const res = await supertest(app).get(`/api/feats?${query}`).set("Cookie", COOKIE);
    expect(res.status).toBe(200);
    return res.body;
  }

  const names = (rows: { name: string }[]) => rows.map((f) => f.name);
  const countOf = (rows: { category: string }[], category: string) =>
    rows.filter((f) => f.category === category).length;

  it("gates the seeded General feats on their explicit levelPrerequisite 4", async () => {
    const atThree = await get("edition=EDITION_2024&asiLevel=3");
    const atFour = await get("edition=EDITION_2024&asiLevel=4");

    expect(names(atThree)).not.toContain("Grappler");
    expect(names(atFour)).toContain("Grappler");
    // Absolute counts, not just the named row: a filter that drops everything
    // satisfies the two assertions above at level 3 and must still fail here.
    expect(countOf(atThree, "general")).toBe(0);
    expect(countOf(atFour, "general")).toBe(19);
  });

  it("gates the seeded Epic Boons on their explicit levelPrerequisite 19", async () => {
    const atEighteen = await get("edition=EDITION_2024&asiLevel=18");
    const atNineteen = await get("edition=EDITION_2024&asiLevel=19");

    expect(names(atEighteen)).not.toContain("Boon of Truesight");
    expect(names(atNineteen)).toContain("Boon of Truesight");
    expect(countOf(atEighteen, "epic_boon")).toBe(0);
    expect(countOf(atNineteen, "epic_boon")).toBe(7);
  });

  it("never offers an Origin or Fighting Style feat at any level", async () => {
    for (const asiLevel of [1, 3, 4, 18, 19, 20]) {
      const rows = await get(`edition=EDITION_2024&asiLevel=${asiLevel}`);
      expect(names(rows)).not.toContain("Magic Initiate"); // origin
      expect(names(rows)).not.toContain("Archery"); // fighting_style
      expect(countOf(rows, "origin")).toBe(0);
      expect(countOf(rows, "fighting_style")).toBe(0);
    }
  });

  it("at asiLevel=20 offers every seeded General and Epic Boon and nothing else", async () => {
    const rows = await get("edition=EDITION_2024&asiLevel=20");
    expect(countOf(rows, "general")).toBe(19);
    expect(countOf(rows, "epic_boon")).toBe(7);
    expect(rows).toHaveLength(26);
  });

  it("without ?asiLevel= still serves Origin rows, so the non-ASI consumers are unaffected", async () => {
    const rows = await get("edition=EDITION_2024");
    expect(countOf(rows, "origin")).toBeGreaterThan(0);
    expect(countOf(rows, "fighting_style")).toBeGreaterThan(0);
    expect(names(rows)).toContain("Magic Initiate");
  });

  it("400s on a non-numeric ?asiLevel=", async () => {
    const res = await supertest(app)
      .get("/api/feats?edition=EDITION_2024&asiLevel=abc")
      .set("Cookie", COOKIE);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^Invalid asiLevel: /);
  });

  it("400s on an out-of-range ?asiLevel= rather than clamping it", async () => {
    for (const bad of ["0", "21", "-3", "4.5"]) {
      const res = await supertest(app)
        .get(`/api/feats?edition=EDITION_2024&asiLevel=${bad}`)
        .set("Cookie", COOKIE);
      expect(res.status, `asiLevel=${bad}`).toBe(400);
    }
  });
});

/**
 * PHB'14 p. 72 (Fighter) / p. 82 (Paladin) / p. 91 (Ranger), = SRD 5.1 (#1311).
 * Runs against the REAL SEEDED catalog, same as the asiLevel suite above — the
 * absolute counts (6 vs 4) are what proves the six 2014 rows resolve for a
 * 2014 character and are hidden from a 2024 one, not just present somewhere
 * in the table.
 */
describe("GET /api/feats — 2014 Fighting Style feats resolve distinctly from 2024's (#1311)", () => {
  async function get(edition: string): Promise<{ name: string; category: string; description: string }[]> {
    const res = await supertest(app).get(`/api/feats?edition=${edition}`).set("Cookie", COOKIE);
    expect(res.status).toBe(200);
    return res.body;
  }

  const fightingStyles = (rows: { name: string; category: string }[]) =>
    rows.filter((r) => r.category === "fighting_style").map((r) => r.name).sort();

  it("EDITION_2014 resolves all six PHB'14 styles, including Dueling and Protection", async () => {
    const rows = await get("EDITION_2014");
    expect(fightingStyles(rows)).toEqual(
      ["Archery", "Defense", "Dueling", "Great Weapon Fighting", "Protection", "Two-Weapon Fighting"],
    );
  });

  it("EDITION_2024 resolves exactly the four SRD 5.2 styles — Dueling and Protection are absent", async () => {
    const rows = await get("EDITION_2024");
    expect(fightingStyles(rows)).toEqual(["Archery", "Defense", "Great Weapon Fighting", "Two-Weapon Fighting"]);
  });

  it("Great Weapon Fighting's id and reroll-vs-treat-as-3 text differ by edition (genuine mechanical fork)", async () => {
    const gwf2014 = (await get("EDITION_2014")).find((r) => r.name === "Great Weapon Fighting")!;
    const gwf2024 = (await get("EDITION_2024")).find((r) => r.name === "Great Weapon Fighting")!;
    expect(gwf2014.description).toMatch(/reroll the die/i);
    expect(gwf2024.description).toMatch(/treat any 1 or 2.*as a 3/i);
  });
});
