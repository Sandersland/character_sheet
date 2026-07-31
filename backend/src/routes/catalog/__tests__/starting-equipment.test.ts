// Wire-equivalence fixture (#1534). starting-equipment-2014.json is a captured
// snapshot of GET /api/reference?edition=EDITION_2014's classes[].startingEquipment
// (keyed by class name) taken BEFORE this issue's row-based reader replaced the
// old per-class-name TS lookup table — it must stay green across that swap.
// toEqual (not toMatchObject/toStrictEqual/a string compare) is deliberate: it
// fails on `items: []` vs absent and on `quantity: 1` vs absent, the two real
// omission hazards, and does not pin JSON key order, which nothing reads.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { authCookie } from "@/test-support/auth.js";

const FIXTURE_2014 = JSON.parse(
  readFileSync(fileURLToPath(new URL("./__fixtures__/starting-equipment-2014.json", import.meta.url)), "utf8"),
);

const OWNER_ID = "owner-starting-equipment";
let COOKIE: string;

beforeAll(async () => {
  COOKIE = await authCookie(OWNER_ID);
});

function startingEquipmentByName(body: { classes: { name: string; startingEquipment: unknown }[] }) {
  const byName: Record<string, unknown> = {};
  for (const c of body.classes) byName[c.name] = c.startingEquipment;
  return byName;
}

describe("GET /api/reference — startingEquipment (#1534)", () => {
  it("EDITION_2014 deep-equals the captured fixture for all twelve classes", async () => {
    const response = await supertest
      .agent(createApp())
      .set("Cookie", COOKIE)
      .get("/api/reference?edition=EDITION_2014");

    expect(response.status).toBe(200);
    expect(startingEquipmentByName(response.body)).toEqual(FIXTURE_2014);
  });

  // Asserted SEPARATELY from the 2014 case (not derived from that response) so
  // the two editions are proven to resolve independently rather than by one
  // shared code path returning one answer. #1533's EDITION_2024 rows are an
  // interim verbatim copy of the 2014 ones (#1535, parked, replaces them), so
  // the expected content is the SAME fixture — that sameness is the seed
  // content's property, not this test's; do not read a green run here as "the
  // 2024 content is real".
  it("EDITION_2024 returns the same twelve packages (the #1533 interim copy)", async () => {
    const response = await supertest
      .agent(createApp())
      .set("Cookie", COOKIE)
      .get("/api/reference?edition=EDITION_2024");

    expect(response.status).toBe(200);
    expect(startingEquipmentByName(response.body)).toEqual(FIXTURE_2014);
  });
});
