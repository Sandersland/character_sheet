import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertCharacterAccess } from "../auth/access.js";
import { AuthorizationError, NotFoundError } from "../auth/errors.js";
import { prisma } from "../prisma.js";
import { ensureTestOwner } from "../../test-support/owner.js";

// Unit test for the single character-access chokepoint. Real Postgres (no mocks)
// — it issues one findUnique. Two owners + one character owned by A.

const OWNER_A = "owner-access-a";
const OWNER_B = "owner-access-b";
const CHARACTER_ID = "test-access-character-1";

const FIXTURE = {
  id: CHARACTER_ID,
  name: "Access Test Fixture",
  alignment: "Lawful Good",
  armorClass: 10,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 10, max: 10, temp: 0 },
  hitDice: { total: 1, die: "d8" },
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

describe("assertCharacterAccess", () => {
  beforeAll(async () => {
    await ensureTestOwner(OWNER_A);
    await ensureTestOwner(OWNER_B);
    await prisma.character.deleteMany({ where: { id: CHARACTER_ID } });
    await prisma.character.create({ data: { ...FIXTURE, ownerId: OWNER_A } });
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: CHARACTER_ID } });
  });

  it("returns the minimal row for the owner (view)", async () => {
    const row = await assertCharacterAccess(prisma, OWNER_A, CHARACTER_ID, "view");
    expect(row).toEqual({ id: CHARACTER_ID, ownerId: OWNER_A });
  });

  it("returns the minimal row for the owner (edit)", async () => {
    const row = await assertCharacterAccess(prisma, OWNER_A, CHARACTER_ID, "edit");
    expect(row.ownerId).toBe(OWNER_A);
  });

  it("throws a 403 AuthorizationError for a non-owner", async () => {
    await expect(
      assertCharacterAccess(prisma, OWNER_B, CHARACTER_ID, "view"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      assertCharacterAccess(prisma, OWNER_B, CHARACTER_ID, "edit"),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("throws a 404 NotFoundError for a missing character", async () => {
    await expect(
      assertCharacterAccess(prisma, OWNER_A, "does-not-exist", "view"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      assertCharacterAccess(prisma, OWNER_A, "does-not-exist", "edit"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("works inside a $transaction client", async () => {
    const row = await prisma.$transaction((tx) =>
      assertCharacterAccess(tx, OWNER_A, CHARACTER_ID, "edit"),
    );
    expect(row.ownerId).toBe(OWNER_A);
  });
});
