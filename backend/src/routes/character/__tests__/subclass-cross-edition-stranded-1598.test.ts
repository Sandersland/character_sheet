import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { seededSpeciesAnchor } from "@/test-support/species.js";

const OWNER_ID = "owner-1598-stranded-subclass";
let COOKIE: string;

const BASE_ABILITY_SCORES = {
  strength: 10, dexterity: 12, constitution: 14, intelligence: 15, wisdom: 14, charisma: 12,
};

interface StrandedFixture {
  subclassId: string;
  subclassName: string;
  className: string;
}

let fixtures: StrandedFixture[];

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);

  const rows = await prisma.subclass.findMany({
    where: { edition: "EDITION_2014" },
    select: { id: true, name: true, class: { select: { name: true } } },
  });
  if (rows.length === 0) {
    throw new Error("No EDITION_2014-only Subclass rows seeded — run `prisma db seed` before tests");
  }
  fixtures = rows.map((r) => ({ subclassId: r.id, subclassName: r.name, className: r.class.name }));
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "1598 Stranded" } } });
});

async function createCharacter(name: string, className: string, experiencePoints = 900) {
  const anchor = await seededSpeciesAnchor("EDITION_2024");
  const res = await supertest(app)
    .post("/api/characters")
    .set("Cookie", COOKIE)
    .send({
      name,
      alignment: "True Neutral",
      ...anchor,
      background: "Sage",
      classes: [{ name: className }],
      abilityScores: BASE_ABILITY_SCORES,
      rulesEdition: "EDITION_2024",
      // 900 XP = level 3; subclassGateLevel returns 3 for EDITION_2024, so the gate has passed and needsSubclass's non-gate half is what this test isolates.

      experiencePoints,
    });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

// Bypasses setSubclass's crossEditionRejection deliberately — the only route into this state is a catalog retag under an already-held row, never a fresh pick.

async function strandOnSubclass(characterId: string, className: string, fixture: StrandedFixture) {
  await prisma.characterClassEntry.updateMany({
    where: { characterId, name: className },
    data: { subclass: fixture.subclassName, subclassId: fixture.subclassId },
  });
}

function get(id: string) {
  return supertest(app).get(`/api/characters/${id}`).set("Cookie", COOKIE);
}

describe("a 2024 character stranded on a 2014-only subclass row (#1598)", () => {
  it("discovers at least the three known 2014-only rows (not hardcoded — proves the loop below actually parameterizes)", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(3);
  });

  it("marks every stranded entry: name shown, zero subclass features, both flags set — never silently featureless", async () => {
    for (const fixture of fixtures) {
      const id = await createCharacter(`1598 Stranded ${fixture.subclassName}`, fixture.className);
      await strandOnSubclass(id, fixture.className, fixture);

      const res = await get(id);
      expect(res.status).toBe(200);

      const entry = (res.body.classes as { name: string; subclass?: string; needsSubclass: boolean; subclassUnavailable: boolean }[])
        .find((c) => c.name === fixture.className);
      expect(entry, `no classes[] entry for ${fixture.className}`).toBeTruthy();

      // The name still renders (buildClassesView's subclass/subclassId fields are unchanged); the marker below is what distinguishes this from a healthy sheet.

      expect(entry!.subclass).toBe(fixture.subclassName);
      expect(entry!.subclassUnavailable).toBe(true);
      expect(entry!.needsSubclass).toBe(true);

      // AC: never a subclass NAME with zero features and no marker. This proves the zero-features half is real, not just a fixture that happens to have none.

      const subclassFeatures = (res.body.resources?.features as { source: string }[] | undefined ?? [])
        .filter((f) => f.source === "subclass");
      expect(subclassFeatures).toEqual([]);
    }
  });

  it("a HEALTHY (non-stranded) subclass pick is NOT marked — the flags aren't just always true", async () => {
    // Sourced from the DB rather than hardcoded so this stays valid regardless of which rows the catalog carries; needs one row not already claimed by the fixtures loop above.

    const claimedClassNames = new Set(fixtures.map((f) => f.className));
    const healthyRow = await prisma.subclass.findFirst({
      where: { edition: { not: "EDITION_2014" }, class: { name: { notIn: [...claimedClassNames] } } },
      select: { id: true, name: true, class: { select: { name: true } } },
    });
    if (!healthyRow) return;

    const id = await createCharacter("1598 Stranded Healthy Control", healthyRow.class.name);
    await strandOnSubclass(id, healthyRow.class.name, { subclassId: healthyRow.id, subclassName: healthyRow.name, className: healthyRow.class.name });

    const res = await get(id);
    expect(res.status).toBe(200);
    const entry = (res.body.classes as { name: string; subclassUnavailable: boolean; needsSubclass: boolean }[])
      .find((c) => c.name === healthyRow.class.name);
    expect(entry!.subclassUnavailable).toBe(false);
    expect(entry!.needsSubclass).toBe(false);
  });

  // character.subclass (character-serialize.ts) reads the RAW entry column and is NOT level-gated; an ungated flag would sail past SubclassSection's `!character.subclass && !needsSubclass` guard and invite a re-pick of an unearned subclass.

  it("does NOT mark a stranded entry that is below its subclass gate — the flag follows the clamp-on-read", async () => {
    const fixture = fixtures[0];

    const id = await createCharacter(`1598 Stranded BelowGate ${fixture.subclassName}`, fixture.className, 0);
    await strandOnSubclass(id, fixture.className, fixture);

    const res = await get(id);
    expect(res.status).toBe(200);
    const entry = (res.body.classes as { name: string; subclass?: string; needsSubclass: boolean; subclassUnavailable: boolean }[])
      .find((c) => c.name === fixture.className);

    expect(entry!.subclass).toBeUndefined();
    expect(entry!.subclassUnavailable).toBe(false);
    expect(entry!.needsSubclass).toBe(false);
  });
});
