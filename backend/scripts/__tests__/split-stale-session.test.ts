// Requires DATABASE_URL.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { planSegments, splitSession, type ActivityItem } from "../split-stale-session.js";

const OWNER_ID = "owner-split-stale-session";
const CHAR_A = "test-split-stale-a";
const CHAR_B = "test-split-stale-b";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

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
  abilityScores: { strength: 10, dexterity: 12, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 },
};

const firstSitting = new Date(Date.now() - 30 * DAY_MS);
const secondSitting = new Date(firstSitting.getTime() + 14 * DAY_MS);
const at = (base: Date, hours: number) => new Date(base.getTime() + hours * HOUR_MS);

function item(at: Date, id = String(at.getTime())): ActivityItem {
  return { kind: "event", id, characterId: CHAR_A, at };
}

async function logEvent(sessionId: string, characterId: string, createdAt: Date, type: "combatStarted" | "sessionEnded" = "combatStarted") {
  await prisma.characterEvent.create({
    data: { characterId, category: type === "sessionEnded" ? "session" : "combat", type, summary: type, sessionId, createdAt },
  });
}

async function writeJournal(sessionId: string, characterId: string, createdAt: Date, body: string) {
  await prisma.journalEntry.create({
    data: { characterId, sessionId, date: createdAt, createdAt, body, authorUserId: OWNER_ID },
  });
}

async function makeMergedSession(status: "active" | "ended"): Promise<string> {
  const session = await prisma.session.create({
    data: {
      title: "Night One",
      status,
      startedAt: firstSitting,
      endedAt: status === "ended" ? new Date() : null,
      participants: { create: [{ characterId: CHAR_A, joinedAt: firstSitting }, { characterId: CHAR_B, joinedAt: firstSitting }] },
    },
  });
  await logEvent(session.id, CHAR_A, at(firstSitting, 1));
  await logEvent(session.id, CHAR_B, at(firstSitting, 2));
  await writeJournal(session.id, CHAR_A, at(firstSitting, 3), "the inn burns");
  await logEvent(session.id, CHAR_A, at(secondSitting, 1));
  await writeJournal(session.id, CHAR_A, at(secondSitting, 2), "Waylin talks");
  if (status === "ended") {
    await logEvent(session.id, CHAR_A, new Date(), "sessionEnded");
    await logEvent(session.id, CHAR_B, new Date(), "sessionEnded");
  }
  return session.id;
}

beforeEach(async () => {
  await ensureTestOwner(OWNER_ID);
  for (const [id, name] of [[CHAR_A, "Antioc"], [CHAR_B, "Thulgrim"]]) {
    await prisma.character.create({
      data: { ...BASE_CHAR, id, name, ownerId: OWNER_ID, experiencePoints: 0, spellcasting: Prisma.JsonNull },
    });
  }
});

afterEach(async () => {
  await prisma.session.deleteMany({ where: { participants: { some: { characterId: { in: [CHAR_A, CHAR_B] } } } } });
  await prisma.character.deleteMany({ where: { id: { in: [CHAR_A, CHAR_B] } } });
});

describe("planSegments", () => {
  it("starts a new sitting at every idle gap of 12h or more", () => {
    const segments = planSegments([item(at(firstSitting, 0)), item(at(firstSitting, 11)), item(at(firstSitting, 23))]);
    expect(segments.map((s) => s.items.length)).toEqual([2, 1]);
  });

  it("splits only at explicit --split-at instants when given", () => {
    const segments = planSegments(
      [item(at(firstSitting, 0)), item(at(firstSitting, 20)), item(at(firstSitting, 40))],
      [at(firstSitting, 30)],
    );
    expect(segments.map((s) => s.items.length)).toEqual([2, 1]);
  });
});

describe("splitSession", () => {
  it("dry run reports the sittings and writes nothing", async () => {
    const sessionId = await makeMergedSession("ended");

    const { segments, sessionIds } = await splitSession(sessionId, { apply: false });

    expect(segments).toHaveLength(2);
    expect(sessionIds).toEqual([]);
    expect(await prisma.session.count({ where: { participants: { some: { characterId: CHAR_A } } } })).toBe(1);
  });

  it("moves the later sitting's events, journal, and participants into a new ended session", async () => {
    const sessionId = await makeMergedSession("ended");

    const { sessionIds } = await splitSession(sessionId, { apply: true });

    expect(sessionIds).toHaveLength(2);
    const [first, second] = await Promise.all(
      sessionIds.map((id) => prisma.session.findUniqueOrThrow({ where: { id }, include: { participants: true, journalEntries: true } })),
    );
    expect(first.id).toBe(sessionId);
    expect(first.endedAt?.getTime()).toBe(at(firstSitting, 3).getTime());
    expect(first.participants.map((p) => p.characterId).sort()).toEqual([CHAR_A, CHAR_B]);
    expect(first.journalEntries.map((j) => j.body)).toEqual(["the inn burns"]);
    expect(first.summary).not.toBeNull();

    expect(second.status).toBe("ended");
    expect(second.title).toBe("Night One");
    expect(second.startedAt.getTime()).toBe(at(secondSitting, 1).getTime());
    expect(second.endedAt?.getTime()).toBe(at(secondSitting, 2).getTime());
    expect(second.participants.map((p) => p.characterId)).toEqual([CHAR_A]);
    expect(second.journalEntries.map((j) => j.body)).toEqual(["Waylin talks"]);
    expect(second.summary).not.toBeNull();

    const ended = await prisma.characterEvent.findMany({ where: { type: "sessionEnded", sessionId: { in: sessionIds } } });
    expect(ended.map((e) => `${e.sessionId}:${e.characterId}`).sort()).toEqual(
      [`${sessionId}:${CHAR_A}`, `${sessionId}:${CHAR_B}`, `${second.id}:${CHAR_A}`].sort(),
    );
  });

  it("clamps a departure that fell in the idle gap to the end of the sitting it left", async () => {
    const sessionId = await makeMergedSession("ended");
    await prisma.sessionParticipant.updateMany({
      where: { sessionId, characterId: CHAR_B },
      data: { leftAt: at(firstSitting, 5) },
    });

    await splitSession(sessionId, { apply: true });

    const b = await prisma.sessionParticipant.findUniqueOrThrow({
      where: { sessionId_characterId: { sessionId, characterId: CHAR_B } },
    });
    expect(b.leftAt?.getTime()).toBe(at(firstSitting, 3).getTime());
  });

  it("closes a still-active merged session", async () => {
    const sessionId = await makeMergedSession("active");

    const { sessionIds } = await splitSession(sessionId, { apply: true });

    const sessions = await prisma.session.findMany({ where: { id: { in: sessionIds } } });
    expect(sessions.map((s) => s.status)).toEqual(["ended", "ended"]);
  });

  it("refuses an active session with activity in the last 12h", async () => {
    const sessionId = await makeMergedSession("active");
    await logEvent(sessionId, CHAR_A, new Date());

    await expect(splitSession(sessionId, { apply: true })).rejects.toThrow(/still be in play/);
  });
});
