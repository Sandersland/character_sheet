/**
 * GET /api/feats edition-aware resolution (#1306). Default (no `?edition=`)
 * stays exactly as before — the current frontend caller (useFeatCatalog)
 * fetches once, flat, with no character in view, so the unfiltered shape
 * must not regress. A valid `?edition=` proves the route routes through
 * resolveEditionCatalog rather than leaving Alert's two rows indistinguishable;
 * an invalid one 400s rather than silently degrading to unfiltered.
 */
import { beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-feats-edition-1306";
let COOKIE: string;

beforeAll(async () => {
  COOKIE = await authCookie(OWNER_ID);
});

describe("GET /api/feats — edition resolution (#1306)", () => {
  it("without ?edition=, returns every row for a name that forks by edition (Alert) — unchanged default behavior", async () => {
    const res = await supertest(createApp()).get("/api/feats").set("Cookie", COOKIE);
    expect(res.status).toBe(200);

    const alerts = res.body.filter((f: { name: string }) => f.name === "Alert");
    expect(alerts).toHaveLength(2);
  });

  it("?edition=EDITION_2014 resolves to exactly one Alert row: the flat +5 variant", async () => {
    const res = await supertest(createApp()).get("/api/feats?edition=EDITION_2014").set("Cookie", COOKIE);
    expect(res.status).toBe(200);

    const alerts = res.body.filter((f: { name: string }) => f.name === "Alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].improvements).toEqual([{ target: "initiative", amount: 5 }]);
  });

  it("?edition=EDITION_2024 resolves to exactly one Alert row: the +PB variant", async () => {
    const res = await supertest(createApp()).get("/api/feats?edition=EDITION_2024").set("Cookie", COOKIE);
    expect(res.status).toBe(200);

    const alerts = res.body.filter((f: { name: string }) => f.name === "Alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].improvements).toEqual([{ target: "initiative", amount: 1, scaling: "proficiencyBonus" }]);
  });

  it("either edition resolves Grappler to the same single shared row", async () => {
    const res2014 = await supertest(createApp()).get("/api/feats?edition=EDITION_2014").set("Cookie", COOKIE);
    const res2024 = await supertest(createApp()).get("/api/feats?edition=EDITION_2024").set("Cookie", COOKIE);

    const grappler2014 = res2014.body.find((f: { name: string }) => f.name === "Grappler");
    const grappler2024 = res2024.body.find((f: { name: string }) => f.name === "Grappler");
    expect(grappler2014.id).toBe(grappler2024.id);
  });

  it("an unrecognized ?edition= value 400s rather than silently falling back to unfiltered", async () => {
    const res = await supertest(createApp()).get("/api/feats?edition=bogus").set("Cookie", COOKIE);
    expect(res.status).toBe(400);
  });
});
