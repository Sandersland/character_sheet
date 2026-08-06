/**
 * #1501 AC: a 2024 character attempting to select the 2014 "Way of the Open
 * Hand" subclass is rejected by crossEditionRejection, and vice versa for a
 * 2014 character picking 2024's "Warrior of the Open Hand" — asserted at the
 * setSubclass WRITE path (class.ts's crossEditionRejection call), not just
 * what the picker happens to list. Exercised against the real seeded
 * catalog, mirroring subclass-active-edition-1291.test.ts's pattern.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { seededSpeciesAnchor } from "@/test-support/species.js";

const OWNER_ID = "owner-1501-open-hand-cross-edition";
let COOKIE: string;

const BASE_ABILITY_SCORES = {
  strength: 10, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 15, charisma: 10,
};

let wayOfTheOpenHandId: string;
let warriorOfTheOpenHandId: string;

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);

  const monk = await prisma.characterClass.findUnique({ where: { name: "Monk" }, select: { id: true } });
  if (!monk) throw new Error("Monk class not seeded — run `prisma db seed` before tests");

  const wayOfTheOpenHand = await prisma.subclass.findFirst({
    where: { classId: monk.id, name: "Way of the Open Hand", edition: "EDITION_2014" },
    select: { id: true },
  });
  if (!wayOfTheOpenHand) throw new Error('"Way of the Open Hand" subclass not seeded — run `prisma db seed` before tests');
  wayOfTheOpenHandId = wayOfTheOpenHand.id;

  const warriorOfTheOpenHand = await prisma.subclass.findFirst({
    where: { classId: monk.id, name: "Warrior of the Open Hand", edition: "EDITION_2024" },
    select: { id: true },
  });
  if (!warriorOfTheOpenHand) throw new Error('"Warrior of the Open Hand" subclass not seeded — run `prisma db seed` before tests');
  warriorOfTheOpenHandId = warriorOfTheOpenHand.id;
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "1501 OpenHand" } } });
});

async function createMonk(name: string, rulesEdition: "EDITION_2014" | "EDITION_2024") {
  const anchor = await seededSpeciesAnchor(rulesEdition);
  const res = await supertest(app)
    .post("/api/characters")
    .set("Cookie", COOKIE)
    .send({
      name,
      alignment: "True Neutral",
      ...anchor,
      background: "Sage",
      classes: [{ name: "Monk" }],
      abilityScores: BASE_ABILITY_SCORES,
      rulesEdition,
      experiencePoints: 900, // level 3 — the subclass grant level in both editions
    });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

function setSubclass(characterId: string, subclassId: string) {
  return supertest(app)
    .post(`/api/characters/${characterId}/class/transactions`)
    .set("Cookie", COOKIE)
    .send({ operations: [{ type: "setSubclass", subclassId }] });
}

describe("Open Hand subclass pick is rejected across editions (#1501)", () => {
  it("a 2024 monk is rejected picking the 2014-only Way of the Open Hand", async () => {
    const id = await createMonk("1501 OpenHand 2024 picks 2014", "EDITION_2024");
    const res = await setSubclass(id, wayOfTheOpenHandId);
    expect(res.status).toBe(400);
  });

  it("a 2014 monk is rejected picking the 2024-only Warrior of the Open Hand", async () => {
    const id = await createMonk("1501 OpenHand 2014 picks 2024", "EDITION_2014");
    const res = await setSubclass(id, warriorOfTheOpenHandId);
    expect(res.status).toBe(400);
  });

  it("a 2014 monk CAN pick Way of the Open Hand", async () => {
    const id = await createMonk("1501 OpenHand 2014 picks 2014", "EDITION_2014");
    const res = await setSubclass(id, wayOfTheOpenHandId);
    expect(res.status).toBe(200);
  });

  it("a 2024 monk CAN pick Warrior of the Open Hand", async () => {
    const id = await createMonk("1501 OpenHand 2024 picks 2024", "EDITION_2024");
    const res = await setSubclass(id, warriorOfTheOpenHandId);
    expect(res.status).toBe(200);
  });
});
