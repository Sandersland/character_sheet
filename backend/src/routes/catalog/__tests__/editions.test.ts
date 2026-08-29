// This route is edition-independent: ?edition= must be neither honoured nor validated — byte-equality against a param-bearing call is asserted, not just a bare 200.
import { beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-editions-1436";
let COOKIE: string;

beforeAll(async () => {
  COOKIE = await authCookie(OWNER_ID);
});

describe("GET /api/editions", () => {
  it("200s with no query param at all: two rows, 2024 first, each with key/label/description", async () => {
    const res = await supertest(app).get("/api/editions").set("Cookie", COOKIE);
    expect(res.status).toBe(200);

    expect(res.body.editions.map((e: { key: string }) => e.key)).toEqual(["EDITION_2024", "EDITION_2014"]);
    expect(res.body.editions.map((e: { label: string }) => e.label)).toEqual(["2024 rules", "2014 rules"]);
    for (const row of res.body.editions) {
      expect(typeof row.description).toBe("string");
      expect(row.description.length).toBeGreaterThan(0);
    }
  });

  it("serves the creation default explicitly, so no client re-derives it from row order", async () => {
    const res = await supertest(app).get("/api/editions").set("Cookie", COOKIE);
    expect(res.body.defaultEdition).toBe("EDITION_2024");
  });

  it("serves both editions selectable, with no unavailableReason on either (#1372)", async () => {
    const res = await supertest(app).get("/api/editions").set("Cookie", COOKIE);
    const [twentyFour, fourteen] = res.body.editions;

    expect(Object.keys(twentyFour).sort()).toEqual(["description", "key", "label"]);
    expect(Object.keys(fourteen).sort()).toEqual(["description", "key", "label"]);
  });

  it("ignores ?edition= rather than validating it — the param is meaningless here", async () => {
    const bare = await supertest(app).get("/api/editions").set("Cookie", COOKIE);
    const with2014 = await supertest(app)
      .get("/api/editions?edition=EDITION_2014")
      .set("Cookie", COOKIE);
    const nonsense = await supertest(app).get("/api/editions?edition=nope").set("Cookie", COOKIE);

    expect(with2014.status).toBe(200);
    expect(nonsense.status).toBe(200);
    expect(with2014.body).toEqual(bare.body);
    expect(nonsense.body).toEqual(bare.body);
  });
});
