import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { createTestCharacter } from "@/test-support/character.js";

const OWNER_ID = "owner-hp-lock";
let COOKIE: string;
let characterId: string;

const CONCURRENT_REQUESTS = 10;
const START_HP = 100;

async function postHp(id: string, body: object) {
  return supertest(app).post(`/api/characters/${id}/hp`).set("Cookie", COOKIE).send(body);
}

async function postAction(id: string, body: object) {
  return supertest(app).post(`/api/characters/${id}/actions/transactions`).set("Cookie", COOKIE).send(body);
}

describe("Character transactions — concurrent requests serialize on the character row", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    characterId = await createTestCharacter(OWNER_ID, {
      hitPoints: { current: START_HP, max: 200, temp: 0 },
    });
  });

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { id: OWNER_ID } });
  });

  it(`applies all ${CONCURRENT_REQUESTS} concurrent 1-damage /hp requests (no lost updates)`, async () => {
    const responses = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, () =>
        postHp(characterId, { operations: [{ type: "damage", amount: 1 }] }),
      ),
    );

    for (const res of responses) {
      expect(res.status).toBe(200);
    }

    const final = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    expect((final.hitPoints as { current: number }).current).toBe(START_HP - CONCURRENT_REQUESTS);
  });

  // Regression for the actions.ts transaction, which opened its own $transaction with no row lock
  // (reads there ran before the shared lock existed at all): mixes /hp damage with /actions heal
  // (handOfHealingFlurry — no class/resource gating, so no fixture setup is needed) on one
  // character, concurrently, so both write paths race for the same row.
  it("applies concurrent /actions heals and /hp damage together (no lost updates across the two transaction paths)", async () => {
    const damageRequests = 5;
    const healRequests = 5;
    const damageAmount = 2;
    const healAmount = 1;

    const responses = await Promise.all([
      ...Array.from({ length: damageRequests }, () =>
        postHp(characterId, { operations: [{ type: "damage", amount: damageAmount }] }),
      ),
      ...Array.from({ length: healRequests }, () =>
        postAction(characterId, {
          operations: [{ type: "executeAction", actionKey: "handOfHealingFlurry", roll: healAmount }],
        }),
      ),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(200);
    }

    const final = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    const expected = START_HP - damageRequests * damageAmount + healRequests * healAmount;
    expect((final.hitPoints as { current: number }).current).toBe(expected);
  });
});
