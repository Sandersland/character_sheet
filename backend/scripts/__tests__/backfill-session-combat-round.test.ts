// backfill-session-combat-round (#1030): seeds Session.round AND combatActive
// from the legacy combat-event trail for sessions created before the
// migration. Requires DATABASE_URL.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { backfillSessionCombatRound } from "../backfill-session-combat-round.js";

const OWNER_ID = "owner-backfill-combat-round";
const CHAR_ID = "test-backfill-combat-round-char";

const BASE_CHAR = {
  alignment: "Neutral",
  initiativeBonus: 0,
  speed: 30,
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  hitPoints: { current: 20, max: 20, temp: 0 },
  hitDice: { total: 3, die: "d6" },
  abilityScores: {
    strength: 10, dexterity: 12, constitution: 12,
    intelligence: 10, wisdom: 10, charisma: 10,
  },
};

async function makeSession(round: number): Promise<string> {
  const session = await prisma.session.create({
    data: { title: "Legacy Session", round, participants: { create: { characterId: CHAR_ID } } },
  });
  return session.id;
}

async function logRoundEvent(sessionId: string, round: number, at: Date): Promise<void> {
  await prisma.characterEvent.create({
    data: {
      characterId: CHAR_ID,
      category: "combat",
      type: "combatRoundAdvanced",
      summary: `Round ${round} began`,
      sessionId,
      data: { round } as Prisma.InputJsonValue,
      createdAt: at,
    },
  });
}

async function logLifecycleEvent(
  sessionId: string,
  type: "combatStarted" | "combatEnded",
  at: Date,
): Promise<void> {
  await prisma.characterEvent.create({
    data: {
      characterId: CHAR_ID,
      category: "combat",
      type,
      summary: type === "combatStarted" ? "Combat started" : "Combat ended",
      sessionId,
      createdAt: at,
    },
  });
}

beforeEach(async () => {
  await ensureTestOwner(OWNER_ID);
  await prisma.character.create({
    data: { ...BASE_CHAR, id: CHAR_ID, name: "Legacy Wanderer", ownerId: OWNER_ID, experiencePoints: 0, spellcasting: Prisma.JsonNull },
  });
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: CHAR_ID } });
});

describe("backfillSessionCombatRound (#1030)", () => {
  it("seeds round from the latest combatRoundAdvanced event, and infers combatActive:true (no later combatEnded)", async () => {
    const sessionId = await makeSession(0);
    await logRoundEvent(sessionId, 2, new Date("2026-01-01T00:00:00Z"));
    await logRoundEvent(sessionId, 3, new Date("2026-01-01T00:05:00Z"));

    const result = await backfillSessionCombatRound(prisma);

    expect(result.changedSessions).toContain(sessionId);
    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.round).toBe(3);
    // #1030 finding #4: the latest combat event is combatRoundAdvanced with no
    // later combatEnded — still mid-fight, so combatActive must surface too,
    // or round:3 can never reach the doorway (it gates on combatActive).
    expect(session.combatActive).toBe(true);
  });

  it("infers combatActive:false when the latest combat event is combatEnded", async () => {
    const sessionId = await makeSession(0);
    await logRoundEvent(sessionId, 7, new Date("2026-01-01T00:00:00Z"));
    await logLifecycleEvent(sessionId, "combatEnded", new Date("2026-01-01T00:05:00Z"));

    const result = await backfillSessionCombatRound(prisma);

    expect(result.changedSessions).toContain(sessionId);
    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    // round stays at its last-known value (historical fact); combatActive
    // reflects that the fight had already ended before the migration.
    expect(session.round).toBe(7);
    expect(session.combatActive).toBe(false);
  });

  it("backfills round to 1 when combat started but never advanced past round 1", async () => {
    const sessionId = await makeSession(0);
    await logLifecycleEvent(sessionId, "combatStarted", new Date("2026-01-01T00:00:00Z"));

    const result = await backfillSessionCombatRound(prisma);

    expect(result.changedSessions).toContain(sessionId);
    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    // No combatRoundAdvanced event exists, but combatActive:true always
    // implies round>=1 in the live model (startCombat sets both together).
    expect(session.round).toBe(1);
    expect(session.combatActive).toBe(true);
  });

  it("is a no-op for a session with no combat event", async () => {
    const sessionId = await makeSession(0);

    const result = await backfillSessionCombatRound(prisma);

    expect(result.changedSessions).not.toContain(sessionId);
    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.round).toBe(0);
  });

  it("skips a session whose round is already non-zero (already backfilled or genuinely live)", async () => {
    const sessionId = await makeSession(5);
    await logRoundEvent(sessionId, 1, new Date());

    const result = await backfillSessionCombatRound(prisma);

    expect(result.changedSessions).not.toContain(sessionId);
    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.round).toBe(5);
  });

  it("is idempotent — a second run over already-backfilled sessions changes nothing further", async () => {
    const sessionId = await makeSession(0);
    await logRoundEvent(sessionId, 4, new Date());

    await backfillSessionCombatRound(prisma);
    const second = await backfillSessionCombatRound(prisma);

    expect(second.changedSessions).not.toContain(sessionId);
    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.round).toBe(4);
  });
});
