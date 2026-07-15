import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import {
  InvalidHitPointOperationError,
  applyDamageInTx,
  applyLevelUpHpInTx,
  applyTempHpInTx,
  normalizeHitDice,
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

  describe("applyLevelUpHpInTx (#895 seam)", () => {
    const LEVELUP_BATCH = "batch-levelup-in-tx";

    async function levelUpFixture(experiencePoints: number) {
      const character = await prisma.character.create({
        data: {
          ...BASE_CHAR,
          experiencePoints,
          hitPoints: { current: 30, max: 30, temp: 0 },
          hitDice: { total: 1, die: "d8" },
          ownerId: OWNER_ID,
          spellcasting: Prisma.JsonNull,
          classEntries: { create: { name: "Fighter", level: 1, position: 0 } },
        },
        include: { classEntries: true },
      });
      created.push(character.id);
      return character;
    }

    it("bumps HP + hit dice + class entry and emits one reversible levelUp event under the caller's batchId", async () => {
      const character = await levelUpFixture(300); // derives level 2 → one pending level-up
      const entryId = character.classEntries[0].id;

      await prisma.$transaction((tx) =>
        applyLevelUpHpInTx(tx, character.id, { type: "levelUp", method: "average" }, LEVELUP_BATCH, null),
      );

      const row = await prisma.character.findUniqueOrThrow({
        where: { id: character.id },
        include: { classEntries: true },
      });
      expect(normalizeHitPoints(row.hitPoints)).toMatchObject({ current: 35, max: 35 }); // d8 average = 5
      expect(normalizeHitDice(row.hitDice).total).toBe(2);
      expect(row.classEntries[0].level).toBe(2);

      const events = await prisma.characterEvent.findMany({
        where: { characterId: character.id, batchId: LEVELUP_BATCH },
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ category: "hitPoints", type: "levelUp" });
      expect(events[0].data).toMatchObject({
        method: "average",
        roll: null,
        conMod: 0,
        faces: 8,
        hpGain: 5,
        primaryEntryId: entryId,
        prevEntryLevel: 1,
        newEntryLevel: 2,
      });
    });

    it("throws when there is no pending level-up (hd.total >= derived level)", async () => {
      const character = await levelUpFixture(0); // derives level 1, hd.total already 1
      await expect(
        prisma.$transaction((tx) =>
          applyLevelUpHpInTx(tx, character.id, { type: "levelUp", method: "average" }, LEVELUP_BATCH, null),
        ),
      ).rejects.toThrowError(InvalidHitPointOperationError);
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
