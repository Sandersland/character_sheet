import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import {
  InvalidHitPointOperationError,
  applyDamageInTx,
  applyTempHpInTx,
  normalizeHitPoints,
} from "@/lib/combat/hitpoints.js";

const OWNER_ID = "owner-hp-in-tx";
const BATCH = "batch-hp-in-tx";

const BASE_CHAR = {
  name: "In-Tx Fixture",
  alignment: "Lawful Good",
  experiencePoints: 0,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 30, max: 30, temp: 0 },
  hitDice: { total: 1, die: "d8" },
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

async function hp(characterId: string) {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
  return normalizeHitPoints(row.hitPoints);
}

async function makeCharacter(hitPoints: { current: number; max: number; temp: number }) {
  const character = await prisma.character.create({
    data: {
      ...BASE_CHAR,
      hitPoints,
      ownerId: OWNER_ID,
      spellcasting: Prisma.JsonNull,
      classEntries: { create: { name: "Fighter", level: 1, position: 0 } },
    },
  });
  return character.id;
}

describe("applyDamageInTx / applyTempHpInTx shared in-tx HP mutation (#816)", () => {
  const created: string[] = [];

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
  });

  afterEach(async () => {
    if (created.length) await prisma.character.deleteMany({ where: { id: { in: created.splice(0) } } });
  });

  async function fixture(hitPoints = { current: 30, max: 30, temp: 0 }) {
    const id = await makeCharacter(hitPoints);
    created.push(id);
    return id;
  }

  describe("applyDamageInTx", () => {
    it("rejects a non-positive amount with the exact message", async () => {
      const id = await fixture();
      await expect(
        prisma.$transaction((tx) => applyDamageInTx(tx, id, 0, BATCH, null)),
      ).rejects.toThrowError(new InvalidHitPointOperationError("damage amount must be positive"));
      await expect(
        prisma.$transaction((tx) => applyDamageInTx(tx, id, -5, BATCH, null)),
      ).rejects.toThrowError(new InvalidHitPointOperationError("damage amount must be positive"));
      // No mutation on the rejected path.
      expect((await hp(id)).current).toBe(30);
    });

    it("throws Character not found for an unknown id", async () => {
      await expect(
        prisma.$transaction((tx) => applyDamageInTx(tx, "does-not-exist", 5, BATCH, null)),
      ).rejects.toThrowError(new InvalidHitPointOperationError("Character not found: does-not-exist"));
    });

    it("absorbs temp HP first, then current, flooring current at 0", async () => {
      const id = await fixture({ current: 30, max: 30, temp: 4 });
      await prisma.$transaction((tx) => applyDamageInTx(tx, id, 10, BATCH, null));
      const after = await hp(id);
      expect(after.temp).toBe(0);
      expect(after.current).toBe(24);
    });

    it("floors current at 0 for lethal damage", async () => {
      const id = await fixture();
      await prisma.$transaction((tx) => applyDamageInTx(tx, id, 999, BATCH, null));
      expect((await hp(id)).current).toBe(0);
    });

    it("returns null when the character is not concentrating", async () => {
      const id = await fixture();
      const result = await prisma.$transaction((tx) => applyDamageInTx(tx, id, 5, BATCH, null));
      expect(result).toBeNull();
    });
  });

  describe("applyTempHpInTx", () => {
    it("rejects a non-positive amount with the exact message", async () => {
      const id = await fixture();
      await expect(
        prisma.$transaction((tx) => applyTempHpInTx(tx, id, 0, BATCH, null)),
      ).rejects.toThrowError(new InvalidHitPointOperationError("temp HP amount must be positive"));
      expect((await hp(id)).temp).toBe(0);
    });

    it("throws Character not found for an unknown id", async () => {
      await expect(
        prisma.$transaction((tx) => applyTempHpInTx(tx, "does-not-exist", 5, BATCH, null)),
      ).rejects.toThrowError(new InvalidHitPointOperationError("Character not found: does-not-exist"));
    });

    it("takes the higher value (5e temp HP does not stack)", async () => {
      const id = await fixture({ current: 30, max: 30, temp: 8 });
      await prisma.$transaction((tx) => applyTempHpInTx(tx, id, 5, BATCH, null));
      expect((await hp(id)).temp).toBe(8);
      await prisma.$transaction((tx) => applyTempHpInTx(tx, id, 12, BATCH, null));
      expect((await hp(id)).temp).toBe(12);
    });
  });
});
