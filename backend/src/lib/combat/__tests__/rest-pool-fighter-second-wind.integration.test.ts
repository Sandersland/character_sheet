import { afterEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { applyHitPointOperations } from "@/lib/combat/hitpoints.js";

const OWNER_ID = "owner-rest-pool-fighter-1227";
const FIGHTER_2024_ID = "test-rest-pool-fighter-2024-1227";
const FIGHTER_2014_ID = "test-rest-pool-fighter-2014-1227";

const BASE_CHAR = {
  alignment: "Lawful Neutral",
  initiativeBonus: 0,
  speed: 30,
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  spellcasting: Prisma.JsonNull,
};

async function readUsed(characterId: string): Promise<Record<string, number>> {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
  return (row.resources as { used: Record<string, number> }).used;
}

async function createFighter(id: string, edition: "EDITION_2014" | "EDITION_2024", experiencePoints: number, used: Record<string, number>) {
  await ensureTestOwner(OWNER_ID);
  const fighterClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } })).id;
  await prisma.character.create({
    data: {
      ...BASE_CHAR,
      id,
      name: `Rest Pool Fighter ${edition}`,
      ownerId: OWNER_ID,
      rulesEdition: edition,
      experiencePoints,
      hitPoints: { current: 10, max: 18, temp: 0 },
      hitDice: { total: 2, die: "d10", spent: 0 },
      abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 8, wisdom: 10, charisma: 8 },
      resources: { used } as Prisma.InputJsonValue,
      classEntries: { create: [{ name: "fighter", classId: fighterClassId, position: 0 }] },
    },
  });
}

describe("Second Wind (2024, #1227) — the first real shortRestRegain consumer", () => {
  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIGHTER_2024_ID } });
  });

  it("both uses spent -> a short rest regains exactly ONE", async () => {
    await createFighter(FIGHTER_2024_ID, "EDITION_2024", 0, { secondWind: 2 });

    await applyHitPointOperations(FIGHTER_2024_ID, [{ type: "shortRest", rolls: [4] }]);

    const used = await readUsed(FIGHTER_2024_ID);
    expect(used.secondWind).toBe(1);
  });

  it("both uses spent -> a long rest regains ALL", async () => {
    await createFighter(FIGHTER_2024_ID, "EDITION_2024", 0, { secondWind: 2 });

    await applyHitPointOperations(FIGHTER_2024_ID, [{ type: "longRest" }]);

    const used = await readUsed(FIGHTER_2024_ID);
    expect(used.secondWind ?? 0).toBe(0);
  });
});

describe("Second Wind (2014) — full reset on either rest, unchanged mechanic (recharge bug fix only)", () => {
  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIGHTER_2014_ID } });
  });

  it("the single use, spent -> a short rest regains it", async () => {
    await createFighter(FIGHTER_2014_ID, "EDITION_2014", 0, { secondWind: 1 });

    await applyHitPointOperations(FIGHTER_2014_ID, [{ type: "shortRest", rolls: [4] }]);

    const used = await readUsed(FIGHTER_2014_ID);
    expect(used.secondWind ?? 0).toBe(0);
  });

  it("the single use, spent -> a long rest ALSO regains it (recharge bug fix — was 'shortRest' only)", async () => {
    await createFighter(FIGHTER_2014_ID, "EDITION_2014", 0, { secondWind: 1 });

    await applyHitPointOperations(FIGHTER_2014_ID, [{ type: "longRest" }]);

    const used = await readUsed(FIGHTER_2014_ID);
    expect(used.secondWind ?? 0).toBe(0);
  });
});

describe("Action Surge — recharge bug fix, BOTH editions (#1227: not the #1221 partial shape, no shortRestRegain)", () => {
  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIGHTER_2024_ID } });
    await prisma.character.deleteMany({ where: { id: FIGHTER_2014_ID } });
  });

  it("2024: a long rest recharges Action Surge (was inert — resourceFn declared 'shortRest' only)", async () => {
    await createFighter(FIGHTER_2024_ID, "EDITION_2024", 2700, { actionSurge: 1 });

    await applyHitPointOperations(FIGHTER_2024_ID, [{ type: "longRest" }]);

    const used = await readUsed(FIGHTER_2024_ID);
    expect(used.actionSurge ?? 0).toBe(0);
  });

  it("2014: a long rest recharges Action Surge too — the same live bug, same fix", async () => {
    await createFighter(FIGHTER_2014_ID, "EDITION_2014", 2700, { actionSurge: 1 });

    await applyHitPointOperations(FIGHTER_2014_ID, [{ type: "longRest" }]);

    const used = await readUsed(FIGHTER_2014_ID);
    expect(used.actionSurge ?? 0).toBe(0);
  });

  it("2024: a short rest ALSO recharges Action Surge (short-or-long, unchanged behavior)", async () => {
    await createFighter(FIGHTER_2024_ID, "EDITION_2024", 2700, { actionSurge: 1 });

    await applyHitPointOperations(FIGHTER_2024_ID, [{ type: "shortRest", rolls: [4] }]);

    const used = await readUsed(FIGHTER_2024_ID);
    expect(used.actionSurge ?? 0).toBe(0);
  });
});
