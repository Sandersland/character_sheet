import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { InvalidClassOperationError, setFightingStyleInTx } from "@/lib/classes/class.js";

const OWNER_ID = "owner-fighting-style-in-tx";
const BATCH = "batch-fighting-style-in-tx";

// Fighter L1 → entitled to one Fighting Style (fightingStyleChoiceCount, SRD data).
const BASE_CHAR = {
  name: "Fighting Style In-Tx Fixture",
  alignment: "Lawful Neutral",
  experiencePoints: 0,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 10, max: 10, temp: 0 },
  hitDice: { total: 1, die: "d10" },
  abilityScores: { strength: 15, dexterity: 13, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

describe("setFightingStyleInTx (#885 seam)", () => {
  const created: string[] = [];

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
  });

  afterEach(async () => {
    if (created.length) await prisma.character.deleteMany({ where: { id: { in: created.splice(0) } } });
  });

  async function fixture() {
    const character = await prisma.character.create({
      data: {
        ...BASE_CHAR,
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        classEntries: { create: { name: "Fighter", level: 1, position: 0 } },
      },
    });
    created.push(character.id);
    return character.id;
  }

  it("records the fighting style and emits one resources event under the caller's batchId", async () => {
    const id = await fixture();

    await prisma.$transaction((tx) =>
      setFightingStyleInTx(tx, id, { type: "setFightingStyle", key: "defense" }, BATCH, null),
    );

    const row = await prisma.character.findUniqueOrThrow({ where: { id } });
    expect((row.resources as { fightingStyle?: string }).fightingStyle).toBe("defense");

    const events = await prisma.characterEvent.findMany({ where: { characterId: id, batchId: BATCH } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ category: "resources", type: "fightingStyleChosen" });
    expect(events[0].data).toMatchObject({ fightingStyle: "defense" });
  });

  it("throws Character not found for an unknown id", async () => {
    await expect(
      prisma.$transaction((tx) =>
        setFightingStyleInTx(tx, "does-not-exist", { type: "setFightingStyle", key: "defense" }, BATCH, null),
      ),
    ).rejects.toThrowError(new InvalidClassOperationError("Character not found: does-not-exist"));
  });
});
