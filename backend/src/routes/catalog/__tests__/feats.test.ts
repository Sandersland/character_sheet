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

import { createApp } from "@/app.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-feats-edition-1306";
let COOKIE: string;

beforeAll(async () => {
  COOKIE = await authCookie(OWNER_ID);
});

describe("GET /api/feats — edition resolution (#1306)", () => {
  it("without ?edition=, 400s rather than serving a flat cross-edition catalog", async () => {
    const res = await supertest(createApp()).get("/api/feats").set("Cookie", COOKIE);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Missing required query parameter: edition");
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

  it("an unrecognized ?edition= value 400s with a message distinct from the missing-param one", async () => {
    const res = await supertest(createApp()).get("/api/feats?edition=bogus").set("Cookie", COOKIE);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^Unknown edition: /);
  });
});
