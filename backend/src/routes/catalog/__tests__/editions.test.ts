/**
 * GET /api/editions (#1436) — the edition list + copy the picker renders.
 *
 * The interesting property is a NEGATIVE one: this route is edition-independent,
 * so `?edition=` must be neither honoured nor validated. Both are asserted (a
 * bare 200, and byte-equality against a param-bearing call), because "ignores
 * the param" and "400s on the param" are indistinguishable from a single
 * successful bare request.
 */
import { beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-editions-1436";
let COOKIE: string;

beforeAll(async () => {
  COOKIE = await authCookie(OWNER_ID);
});

describe("GET /api/editions", () => {
  it("200s with no query param at all: two rows, 2024 first, each with key/label/description", async () => {
    const res = await supertest(createApp()).get("/api/editions").set("Cookie", COOKIE);
    expect(res.status).toBe(200);

    expect(res.body.editions.map((e: { key: string }) => e.key)).toEqual(["EDITION_2024", "EDITION_2014"]);
    expect(res.body.editions.map((e: { label: string }) => e.label)).toEqual(["2024 rules", "2014 rules"]);
    for (const row of res.body.editions) {
      expect(typeof row.description).toBe("string");
      expect(row.description.length).toBeGreaterThan(0);
    }
  });

  it("serves the creation default explicitly, so no client re-derives it from row order", async () => {
    const res = await supertest(createApp()).get("/api/editions").set("Cookie", COOKIE);
    expect(res.body.defaultEdition).toBe("EDITION_2024");
  });

  it("carries unavailableReason on 2014 only (#1371/#1372)", async () => {
    const res = await supertest(createApp()).get("/api/editions").set("Cookie", COOKIE);
    const [twentyFour, fourteen] = res.body.editions;

    expect(Object.keys(twentyFour).sort()).toEqual(["description", "key", "label"]);
    expect(Object.keys(fourteen).sort()).toEqual(["description", "key", "label", "unavailableReason"]);
    expect(fourteen.unavailableReason).toMatch(/Not available yet/);
  });

  it("ignores ?edition= rather than validating it — the param is meaningless here", async () => {
    const bare = await supertest(createApp()).get("/api/editions").set("Cookie", COOKIE);
    const with2014 = await supertest(createApp())
      .get("/api/editions?edition=EDITION_2014")
      .set("Cookie", COOKIE);
    const nonsense = await supertest(createApp()).get("/api/editions?edition=nope").set("Cookie", COOKIE);

    expect(with2014.status).toBe(200);
    expect(nonsense.status).toBe(200);
    expect(with2014.body).toEqual(bare.body);
    expect(nonsense.body).toEqual(bare.body);
  });
});
