// #1223 commit 3: end-to-end proof that Rage's resource pool — now authored
// on the Rage ClassFeature rows (barbarian-features.ts) instead of the
// retired lib/classes/barbarian.ts resourceFn — actually reaches the REST
// PATH (deriveRestPools, combat/rest.ts), not just serializeCharacter. #1528
// chunk 0 exists precisely because narrow-select call sites (this one
// included, via HpOpContext's class.features/subclassRef.features select)
// historically didn't carry feature rows at all — a serialize-only test
// can't catch that class of bug, so this mirrors
// rest-pool-fighter-second-wind.integration.test.ts's shape rather than a
// unit test against poolsFromRows alone.
//
// 2024: SRD 5.2 p.20 "You regain one expended use when you finish a Short
// Rest, and you regain all expended uses when you finish a Long Rest."
// 2014: SRD 5.1 p.21 — long rest only, no short-rest regain at all.
import { afterEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { applyHitPointOperations } from "@/lib/combat/hitpoints.js";

const OWNER_ID = "owner-rest-pool-barbarian-1223";
const BARBARIAN_2024_ID = "test-rest-pool-barbarian-2024-1223";
const BARBARIAN_2014_ID = "test-rest-pool-barbarian-2014-1223";

const BASE_CHAR = {
  alignment: "Chaotic Neutral",
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

async function createBarbarian(id: string, edition: "EDITION_2014" | "EDITION_2024", used: Record<string, number>) {
  await ensureTestOwner(OWNER_ID);
  const barbarianClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Barbarian" } })).id;
  await prisma.character.create({
    data: {
      ...BASE_CHAR,
      id,
      name: `Rest Pool Barbarian ${edition}`,
      ownerId: OWNER_ID,
      rulesEdition: edition,
      experiencePoints: 0, // level 1: rageTotal(1) === 2 uses, both editions
      hitPoints: { current: 10, max: 14, temp: 0 },
      hitDice: { total: 1, die: "d12", spent: 0 },
      abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 8, wisdom: 10, charisma: 8 },
      resources: { used } as Prisma.InputJsonValue,
      classEntries: { create: [{ name: "barbarian", classId: barbarianClassId, position: 0 }] },
    },
  });
}

describe("Rage (2024, #1223) — the second real shortRestRegain consumer, and the L20-cap fix's rest-path counterpart", () => {
  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: BARBARIAN_2024_ID } });
  });

  it("both uses spent -> a short rest regains exactly ONE", async () => {
    await createBarbarian(BARBARIAN_2024_ID, "EDITION_2024", { rage: 2 });

    await applyHitPointOperations(BARBARIAN_2024_ID, [{ type: "shortRest", rolls: [4] }]);

    const used = await readUsed(BARBARIAN_2024_ID);
    expect(used.rage).toBe(1);
  });

  it("both uses spent -> a long rest regains ALL", async () => {
    await createBarbarian(BARBARIAN_2024_ID, "EDITION_2024", { rage: 2 });

    await applyHitPointOperations(BARBARIAN_2024_ID, [{ type: "longRest" }]);

    const used = await readUsed(BARBARIAN_2024_ID);
    expect(used.rage ?? 0).toBe(0);
  });
});

describe("Rage (2014) — long rest only, no short-rest regain at all (SRD 5.1 p.21)", () => {
  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: BARBARIAN_2014_ID } });
  });

  it("both uses spent -> a short rest regains NONE", async () => {
    await createBarbarian(BARBARIAN_2014_ID, "EDITION_2014", { rage: 2 });

    await applyHitPointOperations(BARBARIAN_2014_ID, [{ type: "shortRest", rolls: [4] }]);

    const used = await readUsed(BARBARIAN_2014_ID);
    expect(used.rage).toBe(2);
  });

  it("both uses spent -> a long rest regains ALL", async () => {
    await createBarbarian(BARBARIAN_2014_ID, "EDITION_2014", { rage: 2 });

    await applyHitPointOperations(BARBARIAN_2014_ID, [{ type: "longRest" }]);

    const used = await readUsed(BARBARIAN_2014_ID);
    expect(used.rage ?? 0).toBe(0);
  });
});
