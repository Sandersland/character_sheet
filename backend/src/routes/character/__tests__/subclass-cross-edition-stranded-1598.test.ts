/**
 * #1598: a character can hold a subclass row whose `edition` no longer
 * matches its own — not from a fresh pick (crossEditionRejection blocks that
 * at creation/level-up/setSubclass) but from a catalog retag landing AFTER
 * the character already held the row (#1233 tagged The Archfey/The Great Old
 * One EDITION_2014; a pre-retag 2024 Warlock kept its pick, per
 * remapCharactersOffStaleSubclasses' deliberate "preserve, don't null" policy,
 * seed-subclasses.ts).
 *
 * Before the fix, buildClassesView emitted the subclass NAME gated only by
 * level (subclassActiveAt) while featuresFromRows filtered subclass features
 * by the CHARACTER's edition (class-feature-rows.ts) — zero matching rows for
 * a stranded entry, with no marker anywhere in the payload. The sheet then
 * looked like a class with no patron abilities rather than a broken state
 * (same split-brain #1291 closed, a different route).
 *
 * Parameterized over every 2014-only Subclass row in the seeded catalog
 * (today: barbarian-totem-warrior, warlock-the-archfey,
 * warlock-the-great-old-one) rather than hardcoding that list, so a future
 * retab (wave C, #1336) is covered automatically without touching this file.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

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
  const res = await supertest(app)
    .post("/api/characters")
    .set("Cookie", COOKIE)
    .send({
      name,
      alignment: "True Neutral",
      race: "Hill Dwarf",
      background: "Sage",
      classes: [{ name: className }],
      abilityScores: BASE_ABILITY_SCORES,
      rulesEdition: "EDITION_2024",
      // 900 XP = level 3 (levelForExperience) — both Warlock and Barbarian
      // gain their subclass at 3 in 2024 (subclassGateLevel returns 3
      // unconditionally for EDITION_2024), so the level gate has passed and
      // needsSubclass's non-gate half is what this test isolates.
      experiencePoints,
    });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

// Bypasses setSubclass's crossEditionRejection deliberately — mirrors how
// #1291's test simulates a pre-existing pick — because the only route into
// this state IS a catalog retag under an already-held row, never a fresh pick.
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

      // The name still renders (buildClassesView's existing subclass/subclassId
      // fields are unchanged) — this is exactly the split the issue names, so
      // the marker is what distinguishes it from a healthy sheet.
      expect(entry!.subclass).toBe(fixture.subclassName);
      expect(entry!.subclassUnavailable).toBe(true);
      expect(entry!.needsSubclass).toBe(true);

      // The acceptance criterion, verbatim: never a subclass NAME with ZERO
      // features and NO marker. The marker is asserted above; this asserts the
      // zero-features half of the split is real (not a fixture that happens
      // to already have features some other way).
      const subclassFeatures = (res.body.resources?.features as { source: string }[] | undefined ?? [])
        .filter((f) => f.source === "subclass");
      expect(subclassFeatures).toEqual([]);
    }
  });

  it("a HEALTHY (non-stranded) subclass pick is NOT marked — the flags aren't just always true", async () => {
    // Sourcing a same-edition subclass from the DB (rather than hardcoding a
    // name) keeps this test valid regardless of which classes/rows the
    // catalog carries — it only needs ONE row available to both editions or
    // exact-2024, on a class the fixtures loop above didn't already claim.
    const claimedClassNames = new Set(fixtures.map((f) => f.className));
    const healthyRow = await prisma.subclass.findFirst({
      where: { edition: { not: "EDITION_2014" }, class: { name: { notIn: [...claimedClassNames] } } },
      select: { id: true, name: true, class: { select: { name: true } } },
    });
    if (!healthyRow) return; // no eligible fixture in this seed — nothing to contrast against

    const id = await createCharacter("1598 Stranded Healthy Control", healthyRow.class.name);
    await strandOnSubclass(id, healthyRow.class.name, { subclassId: healthyRow.id, subclassName: healthyRow.name, className: healthyRow.class.name });

    const res = await get(id);
    expect(res.status).toBe(200);
    const entry = (res.body.classes as { name: string; subclassUnavailable: boolean; needsSubclass: boolean }[])
      .find((c) => c.name === healthyRow.class.name);
    expect(entry!.subclassUnavailable).toBe(false);
    expect(entry!.needsSubclass).toBe(false);
  });

  // A level-down leaves subclassId in place and relies on the clamp-on-read to
  // hide it (issue #125), so "stranded" and "below the gate" genuinely co-occur.
  // The flag must follow the clamp: `character.subclass` (character-serialize.ts)
  // reads the RAW entry column and is NOT level-gated, so an ungated flag would
  // sail past SubclassSection's `!character.subclass && !needsSubclass` early
  // return and invite a re-pick of a subclass the character has not yet earned.
  it("does NOT mark a stranded entry that is below its subclass gate — the flag follows the clamp-on-read", async () => {
    const fixture = fixtures[0];
    // XP 0 = level 1, below every 2024 subclass gate (subclassGateLevel is 3).
    const id = await createCharacter(`1598 Stranded BelowGate ${fixture.subclassName}`, fixture.className, 0);
    await strandOnSubclass(id, fixture.className, fixture);

    const res = await get(id);
    expect(res.status).toBe(200);
    const entry = (res.body.classes as { name: string; subclass?: string; needsSubclass: boolean; subclassUnavailable: boolean }[])
      .find((c) => c.name === fixture.className);

    // The clamp already hides the name; the flags must agree rather than
    // advertise a stranded pick the sheet is deliberately not showing.
    expect(entry!.subclass).toBeUndefined();
    expect(entry!.subclassUnavailable).toBe(false);
    expect(entry!.needsSubclass).toBe(false);
  });
});
