/**
 * GET /api/feats edition-aware resolution (#1306, made required by #1411).
 * `?edition=` is mandatory: an absent one and an unrecognized one both 400,
 * and both assert their message — two 400s are not distinguishable by status
 * alone, and the whole point of the required param is that a caller learns
 * which mistake it made. The Alert case is unchanged from #1306 on purpose —
 * proof that making the param required left resolveEditionCatalog's
 * exact-then-shared resolution undisturbed. Grappler's case inverts under
 * #1310: it now forks like Alert instead of staying one shared row.
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

  // #1310 inverts this: Grappler now forks (SRD 5.2 half-feat vs SRD 5.1 flat
  // Strength 13+ prerequisite) — every Feat row is edition-tagged, so no name
  // resolves to the same row across editions any more.
  it("each edition resolves Grappler to its OWN row, not a shared one", async () => {
    const res2014 = await supertest(app).get("/api/feats?edition=EDITION_2014").set("Cookie", COOKIE);
    const res2024 = await supertest(app).get("/api/feats?edition=EDITION_2024").set("Cookie", COOKIE);

    const grappler2014 = res2014.body.find((f: { name: string }) => f.name === "Grappler");
    const grappler2024 = res2024.body.find((f: { name: string }) => f.name === "Grappler");
    expect(grappler2014.id).not.toBe(grappler2024.id);
    // abilityIncrease defaults to 0 at the DB layer (seed.ts's orElse), not
    // NULL — 0 is the "no half-feat bump" wire value, unlike levelPrerequisite.
    expect(grappler2014.abilityIncrease).toBe(0);
    expect(grappler2024.abilityIncrease).toBe(1);
  });

  it("an unrecognized ?edition= value 400s with a message distinct from the missing-param one", async () => {
    const res = await supertest(app).get("/api/feats?edition=bogus").set("Cookie", COOKIE);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^Unknown edition: /);
  });
});

/**
 * Every case here runs against the REAL SEEDED catalog (backend/prisma/seed/feats.ts)
 * — no fixture rows, which is why it can assert absolute category counts. Scoped
 * to `edition=EDITION_2024` throughout: all 19 2024 general rows carry an explicit
 * levelPrerequisite 4 and all 7 epic_boon rows an explicit 19, so the `?? 4` /
 * `?? 19` category defaults are unreachable from THIS edition's real catalog —
 * covered by the fixture rows in feats-asi-level-defaults.test.ts instead.
 *
 * `?? 4` IS reachable from the real catalog since #1310: every one of the 26
 * EDITION_2014 general rows has a NULL levelPrerequisite (PHB'14 has no
 * per-feat level gate). See "GET /api/feats?asiLevel= — 2014 general/origin
 * feats" below for that proof; `?? 19` stays fixture-only (2014 has no
 * epic_boon feats at all).
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

/**
 * PHB'14 pp. 165-170 (#1310): the 26-name general/origin restore. Runs against
 * the REAL SEEDED catalog, same pattern as the two suites above — proves
 * featOfferedForAsiSlot's `general` branch reads a NULL levelPrerequisite as
 * "offered from level 4" for real 2014 rows, not just fixture ones
 * (feats-asi-level-defaults.test.ts already covers the fixture side).
 */
describe("GET /api/feats?asiLevel= — 2014 general/origin feats (#1310)", () => {
  async function get(query: string): Promise<{ name: string; category: string }[]> {
    const res = await supertest(app).get(`/api/feats?${query}`).set("Cookie", COOKIE);
    expect(res.status).toBe(200);
    return res.body;
  }

  it("edition=EDITION_2014 returns exactly 32 rows (26 general/origin + 6 fighting_style), no duplicate name", async () => {
    const rows = await get("edition=EDITION_2014");
    expect(rows).toHaveLength(32);
    const names = rows.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("edition=EDITION_2024 returns exactly 37 rows, no duplicate name", async () => {
    const rows = await get("edition=EDITION_2024");
    expect(rows).toHaveLength(37);
    const names = rows.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("edition=EDITION_2014 serves zero origin/epic_boon rows — every non-fighting_style row is general", async () => {
    const rows = await get("edition=EDITION_2014");
    expect(rows.filter((f) => f.category === "origin")).toHaveLength(0);
    expect(rows.filter((f) => f.category === "epic_boon")).toHaveLength(0);
  });

  it("gates the 2014 general feats on the `?? 4` category default — the AC that no fixture-only test can give", async () => {
    const atThree = await get("edition=EDITION_2014&asiLevel=3");
    const atFour = await get("edition=EDITION_2014&asiLevel=4");
    // All 26 rows share a NULL levelPrerequisite (no PHB'14 feat has a level
    // gate), so all 26 flip from excluded to offered at the SAME asiLevel —
    // the `?? 4` default applying uniformly, not per-row overrides.
    expect(atThree).toHaveLength(0);
    expect(atFour).toHaveLength(26);
  });
});

/**
 * PHB'14 p. 72 (Fighter) / p. 82 (Paladin) / p. 91 (Ranger), = SRD 5.1 (#1495).
 * Runs against the REAL SEEDED catalog, same pattern as the suites above.
 * `?classes=` gates the offered Fighting Style set to the per-class PHB'14
 * subset via fightingStyleFeatOfferedForClasses — 2024 draws no such subset.
 */
describe("GET /api/feats?classes= — 2014 Fighting Style class gate (#1495)", () => {
  async function get(query: string): Promise<{ name: string; category: string }[]> {
    const res = await supertest(app).get(`/api/feats?${query}`).set("Cookie", COOKIE);
    expect(res.status).toBe(200);
    return res.body;
  }

  const fightingStyles = (rows: { name: string; category: string }[]) =>
    rows.filter((r) => r.category === "fighting_style").map((r) => r.name).sort();

  it("a 2014 Ranger is offered only Archery, Defense, Dueling, Two-Weapon Fighting", async () => {
    const rows = await get("edition=EDITION_2014&classes=Ranger");
    expect(fightingStyles(rows)).toEqual(["Archery", "Defense", "Dueling", "Two-Weapon Fighting"]);
  });

  it("a 2014 Paladin is offered only Defense, Dueling, Great Weapon Fighting, Protection", async () => {
    const rows = await get("edition=EDITION_2014&classes=Paladin");
    expect(fightingStyles(rows)).toEqual(["Defense", "Dueling", "Great Weapon Fighting", "Protection"]);
  });

  it("a 2014 Fighter is offered all six styles", async () => {
    const rows = await get("edition=EDITION_2014&classes=Fighter");
    expect(fightingStyles(rows)).toEqual(
      ["Archery", "Defense", "Dueling", "Great Weapon Fighting", "Protection", "Two-Weapon Fighting"],
    );
  });

  it("a 2014 multiclass Fighter/Paladin sees the union (all six, via Fighter alone)", async () => {
    const rows = await get("edition=EDITION_2014&classes=Fighter,Paladin");
    expect(fightingStyles(rows)).toEqual(
      ["Archery", "Defense", "Dueling", "Great Weapon Fighting", "Protection", "Two-Weapon Fighting"],
    );
  });

  it("a 2024 Ranger (or any class) is offered all four styles — no per-class restriction", async () => {
    const rows = await get("edition=EDITION_2024&classes=Ranger");
    expect(fightingStyles(rows)).toEqual(["Archery", "Defense", "Great Weapon Fighting", "Two-Weapon Fighting"]);
  });

  it("without ?classes= still serves every style for the edition, unfiltered", async () => {
    const rows = await get("edition=EDITION_2014");
    expect(fightingStyles(rows)).toHaveLength(6);
  });

  it("does not narrow non-fighting_style feats — their Feat.classes is always unrestricted", async () => {
    const rows = await get("edition=EDITION_2014&classes=Ranger");
    expect(rows.some((r) => r.category === "general")).toBe(true);
  });

  it("400s on an empty ?classes=", async () => {
    const res = await supertest(app).get("/api/feats?edition=EDITION_2014&classes=").set("Cookie", COOKIE);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^Invalid classes: /);
  });

  // Review finding (#1495): asiLevel's own gate (featOfferedForAsiSlot) always
  // strips every fighting_style row before the classes filter ever runs, so
  // combining the two params was a SILENT no-op — classes then matches only
  // general/epic_boon rows, which are always unrestricted (Feat.classes=[]).
  // A clear 400 beats a response that looks valid but ignores half its input.
  it("400s when ?classes= and ?asiLevel= are combined — the two params serve disjoint feat categories", async () => {
    const res = await supertest(app)
      .get("/api/feats?edition=EDITION_2014&asiLevel=4&classes=Ranger")
      .set("Cookie", COOKIE);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/classes.*asiLevel|asiLevel.*classes/i);
  });

  // Review finding (#1495): a repeated `?classes=` key (or `?classes[]=`) parses
  // as an array under Express's query parser, not a string — the error must
  // name that specific reason, not just "must be a non-empty list" (which
  // reads as though the caller supplied nothing).
  it("400s on a repeated ?classes= (array-shaped query value) with a diagnostic naming the actual problem", async () => {
    const res = await supertest(app)
      .get("/api/feats?edition=EDITION_2014&classes=Fighter&classes=Ranger")
      .set("Cookie", COOKIE);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/single comma-separated/i);
  });
});
