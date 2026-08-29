// toEqual (not toMatchObject/toStrictEqual) catches `items: []` vs absent and `quantity: 1` vs absent, the two real omission hazards, without pinning JSON key order.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { authCookie } from "@/test-support/auth.js";

const FIXTURE_2014 = JSON.parse(
  readFileSync(fileURLToPath(new URL("./__fixtures__/starting-equipment-2014.json", import.meta.url)), "utf8"),
);
// SRD 5.2 (#1535); transcribed independently of FIXTURE_2014, never derived from it.
const FIXTURE_2024 = JSON.parse(
  readFileSync(fileURLToPath(new URL("./__fixtures__/starting-equipment-2024.json", import.meta.url)), "utf8"),
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
      .agent(app)
      .set("Cookie", COOKIE)
      .get("/api/reference?edition=EDITION_2014");

    expect(response.status).toBe(200);
    expect(startingEquipmentByName(response.body)).toEqual(FIXTURE_2014);
  });

  // Asserted separately from the 2014 case, not derived from it, so the two editions are proven to resolve independently.
  it("EDITION_2024 deep-equals the SRD 5.2 fixture for all twelve classes", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .get("/api/reference?edition=EDITION_2024");

    expect(response.status).toBe(200);
    expect(startingEquipmentByName(response.body)).toEqual(FIXTURE_2024);
  });
});
