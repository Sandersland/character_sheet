/**
 * Session lifecycle + combat + roll-logging route integration tests.
 * Mirrors spellcasting.test.ts: real Postgres in beforeEach, supertest against
 * createApp(). Sessions and CharacterEvents cascade-delete with the character,
 * so afterEach only needs to delete the character row.
 *
 * No catalog class is needed — the session routes don't gate on class/level and
 * serializeCharacter handles missing classEntries gracefully (class: "").
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { ensureTestOwner } from "../../test-support/owner.js";
import { authCookie } from "../../test-support/auth.js";

// ── Character fixture ─────────────────────────────────────────────────────────

const FIXTURE_ID = "test-sessions-character-1";
const OWNER_ID = "owner-sessions";
let COOKIE: string;

const FIXTURE = {
  id: FIXTURE_ID,
  name: "Sessions Test Fighter",
  alignment: "True Neutral",
  experiencePoints: 900, // level 3
  armorClass: 16,
  initiativeBonus: 2,
  speed: 30,
  hitPoints: { current: 28, max: 28, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 3, die: "d10", spent: 0 },
  abilityScores: {
    strength: 16,
    dexterity: 14,
    constitution: 14,
    intelligence: 10,
    wisdom: 10,
    charisma: 8,
  },
  savingThrowProficiencies: ["strength", "constitution"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 50, pp: 0 },
};

const app = createApp();

function sessionsUrl(suffix = "") {
  return `/api/characters/${FIXTURE_ID}/sessions${suffix}`;
}

beforeEach(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
  await prisma.character.create({ data: { ...FIXTURE, ownerId: OWNER_ID, spellcasting: Prisma.JsonNull } });
});

afterEach(async () => {
  // Sessions and CharacterEvents cascade-delete via their characterId FK.
  await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
});

// ── Session lifecycle ─────────────────────────────────────────────────────────

describe("POST /api/characters/:id/sessions — start session", () => {
  it("creates an active session and returns { session, character }", async () => {
    const res = await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl()).send({ title: "Battle at Phandalin" });

    expect(res.status).toBe(201);
    expect(res.body.session.status).toBe("active");
    expect(res.body.session.title).toBe("Battle at Phandalin");
    expect(res.body.character).toBeDefined();
    expect(res.body.character.id).toBe(FIXTURE_ID);
  });

  it("logs a sessionStarted event", async () => {
    const res = await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl()).send({});
    expect(res.status).toBe(201);

    const event = await prisma.characterEvent.findFirst({
      where: { characterId: FIXTURE_ID, type: "sessionStarted" },
    });
    expect(event).not.toBeNull();
    expect(event?.category).toBe("session");
    expect(event?.sessionId).toBe(res.body.session.id);
  });

  it("409s when a session is already active", async () => {
    await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl()).send({});
    const res = await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl()).send({});

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already active/i);
  });

  it("404s for an unknown character", async () => {
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post("/api/characters/does-not-exist/sessions")
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Character not found");
  });
});

describe("POST /api/characters/:id/sessions/:sessionId/end — end session", () => {
  it("ends the session: status=ended, endedAt set, sessionEnded event logged", async () => {
    const startRes = await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl()).send({});
    const sessionId = startRes.body.session.id as string;

    const endRes = await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl(`/${sessionId}/end`)).send({});

    expect(endRes.status).toBe(200);
    expect(endRes.body.session.status).toBe("ended");
    expect(endRes.body.session.endedAt).not.toBeNull();

    const event = await prisma.characterEvent.findFirst({
      where: { characterId: FIXTURE_ID, type: "sessionEnded" },
    });
    expect(event).not.toBeNull();
    expect(event?.sessionId).toBe(sessionId);
  });

  it("409s when ending an already-ended session", async () => {
    const startRes = await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl()).send({});
    const sessionId = startRes.body.session.id as string;
    await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl(`/${sessionId}/end`)).send({});

    const res = await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl(`/${sessionId}/end`)).send({});
    expect(res.status).toBe(409);
  });

  it("404s for an unknown sessionId", async () => {
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl("/00000000-0000-0000-0000-000000000000/end"))
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("computes and persists a typed summary from the session's events", async () => {
    const startRes = await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl()).send({});
    const sessionId = startRes.body.session.id as string;

    // Generate a spread of summarizable events within the session.
    await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/experience`)
      .send({ operations: [{ type: "award", amount: 450 }] });
    await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl(`/${sessionId}/combat/round`))
      .send({ round: 3 });
    await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl(`/${sessionId}/roll`))
      .send({ kind: "attack", source: "Longsword", total: 17 });
    await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl(`/${sessionId}/roll`))
      .send({ kind: "damage", source: "Longsword", total: 9, damageType: "slashing" });

    const endRes = await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl(`/${sessionId}/end`)).send({});
    expect(endRes.status).toBe(200);

    // Summary is returned by the end response …
    const summary = endRes.body.session.summary;
    expect(summary).toBeDefined();
    expect(summary.xpGained).toBe(450);
    expect(summary.combatRounds).toBe(3);
    expect(summary.attackRolls).toBe(1);
    expect(summary.damageRolls).toBe(1);
    expect(typeof summary.durationMs).toBe("number");
    expect(summary.startedAt).toBeDefined();
    expect(summary.endedAt).toBeDefined();

    // … and persisted on the row (visible via GET).
    const getRes = await supertest.agent(app).set("Cookie", COOKIE).get(sessionsUrl(`/${sessionId}`));
    expect(getRes.status).toBe(200);
    expect(getRes.body.summary.xpGained).toBe(450);
    expect(getRes.body.summary.attackRolls).toBe(1);
  });
});

// ── Active-session contract ───────────────────────────────────────────────────
// Documents the GET /sessions/active behavior that the frontend polls on
// every character sheet load (see sessions-active-404-console-noise memory).

describe("GET /api/characters/:id/sessions/active", () => {
  it("returns the active session when one exists", async () => {
    const startRes = await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl()).send({ title: "Active" });
    const sessionId = startRes.body.session.id as string;

    const res = await supertest.agent(app).set("Cookie", COOKIE).get(sessionsUrl("/active"));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(sessionId);
    expect(res.body.status).toBe("active");
  });

  it("returns 200 with a null body when none is active", async () => {
    const res = await supertest.agent(app).set("Cookie", COOKIE).get(sessionsUrl("/active"));
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("404s for an unknown character id", async () => {
    const res = await supertest.agent(app).set("Cookie", COOKIE).get(
      "/api/characters/00000000-0000-0000-0000-000000000000/sessions/active",
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Character not found");
  });
});

// ── Session detail + events ───────────────────────────────────────────────────

describe("GET /api/characters/:id/sessions/:sessionId", () => {
  it("returns session fields plus events array", async () => {
    const startRes = await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl()).send({ title: "Detail Test" });
    const sessionId = startRes.body.session.id as string;

    const res = await supertest.agent(app).set("Cookie", COOKIE).get(sessionsUrl(`/${sessionId}`));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(sessionId);
    expect(res.body.status).toBe("active");
    expect(Array.isArray(res.body.events)).toBe(true);
    // The sessionStarted event was logged.
    expect(res.body.events.some((e: { type: string }) => e.type === "sessionStarted")).toBe(true);
  });

  it("404s for an unknown sessionId", async () => {
    const res = await supertest.agent(app).set("Cookie", COOKIE).get(sessionsUrl("/00000000-0000-0000-0000-000000000000"));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Session not found");
  });
});

// ── Combat lifecycle ──────────────────────────────────────────────────────────

describe("combat lifecycle routes", () => {
  // Helper: start a session and return its ID.
  async function startSession(): Promise<string> {
    const res = await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl()).send({});
    expect(res.status).toBe(201);
    return res.body.session.id as string;
  }

  it("combat/start logs a combatStarted event", async () => {
    const sessionId = await startSession();

    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl(`/${sessionId}/combat/start`))
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);

    const event = await prisma.characterEvent.findFirst({
      where: { characterId: FIXTURE_ID, type: "combatStarted" },
    });
    expect(event).not.toBeNull();
    expect(event?.category).toBe("combat");
    expect(event?.sessionId).toBe(sessionId);
  });

  it("combat/round logs a combatRoundAdvanced event with correct round data", async () => {
    const sessionId = await startSession();

    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl(`/${sessionId}/combat/round`))
      .send({ round: 2 });
    expect(res.status).toBe(201);

    const event = await prisma.characterEvent.findFirst({
      where: { characterId: FIXTURE_ID, type: "combatRoundAdvanced" },
    });
    expect(event).not.toBeNull();
    expect((event?.data as { round: number } | null)?.round).toBe(2);
  });

  it("combat/round increments: second advance carries new round number", async () => {
    const sessionId = await startSession();

    await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl(`/${sessionId}/combat/round`))
      .send({ round: 2 });
    await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl(`/${sessionId}/combat/round`))
      .send({ round: 3 });

    const events = await prisma.characterEvent.findMany({
      where: { characterId: FIXTURE_ID, type: "combatRoundAdvanced" },
      orderBy: { createdAt: "asc" },
    });
    expect(events).toHaveLength(2);
    expect((events[0].data as { round: number })?.round).toBe(2);
    expect((events[1].data as { round: number })?.round).toBe(3);
  });

  it("combat/round 400s on invalid round (0)", async () => {
    const sessionId = await startSession();
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl(`/${sessionId}/combat/round`))
      .send({ round: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("round must be a positive integer");
  });

  it("combat/round 400s when round is not a number", async () => {
    const sessionId = await startSession();
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl(`/${sessionId}/combat/round`))
      .send({ round: "two" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("round must be a positive integer");
  });

  it("combat/round does not mutate character state", async () => {
    const sessionId = await startSession();

    const before = await prisma.character.findUniqueOrThrow({
      where: { id: FIXTURE_ID },
      select: { hitPoints: true, experiencePoints: true },
    });

    await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl(`/${sessionId}/combat/round`))
      .send({ round: 2 });

    const after = await prisma.character.findUniqueOrThrow({
      where: { id: FIXTURE_ID },
      select: { hitPoints: true, experiencePoints: true },
    });

    expect(after.hitPoints).toEqual(before.hitPoints);
    expect(after.experiencePoints).toBe(before.experiencePoints);
  });

  it("combat/end logs a combatEnded event", async () => {
    const sessionId = await startSession();
    await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl(`/${sessionId}/combat/start`)).send({});

    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl(`/${sessionId}/combat/end`))
      .send({});
    expect(res.status).toBe(201);

    const event = await prisma.characterEvent.findFirst({
      where: { characterId: FIXTURE_ID, type: "combatEnded" },
    });
    expect(event).not.toBeNull();
  });

  // ── Error contract for combat routes ───────────────────────────────────────
  // Note the asymmetry: a truly missing session → 404;
  // an ended (inactive) session → 409 (message "is not active", no "not found").

  it("combat/start 404s for a missing sessionId", async () => {
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl("/00000000-0000-0000-0000-000000000000/combat/start"))
      .send({});
    expect(res.status).toBe(404);
  });

  it("combat/start 409s for an ended session (not 404)", async () => {
    const sessionId = await startSession();
    await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl(`/${sessionId}/end`)).send({});

    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl(`/${sessionId}/combat/start`))
      .send({});
    // Session exists but is not active → CombatError("is not active") → 409.
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/not active/i);
  });
});

// ── Roll logging ──────────────────────────────────────────────────────────────

describe("POST /…/sessions/:sessionId/roll", () => {
  async function startSession(): Promise<string> {
    const res = await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl()).send({});
    return res.body.session.id as string;
  }

  it("logs an attackRoll event with correct data", async () => {
    const sessionId = await startSession();

    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl(`/${sessionId}/roll`))
      .send({ kind: "attack", source: "Longsword", total: 17, specLabel: "1d20+5" });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);

    const event = await prisma.characterEvent.findFirst({
      where: { characterId: FIXTURE_ID, type: "attackRoll" },
    });
    expect(event).not.toBeNull();
    expect(event?.category).toBe("combat");
    expect(event?.sessionId).toBe(sessionId);
    expect((event?.data as { total: number; kind: string } | null)?.total).toBe(17);
    expect((event?.data as { total: number; kind: string } | null)?.kind).toBe("attack");
  });

  it("logs a damageRoll event with damageType", async () => {
    const sessionId = await startSession();

    await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl(`/${sessionId}/roll`))
      .send({ kind: "damage", source: "Longsword", total: 9, damageType: "slashing" });

    const event = await prisma.characterEvent.findFirst({
      where: { characterId: FIXTURE_ID, type: "damageRoll" },
    });
    expect(event).not.toBeNull();
    const data = event?.data as { damageType: string } | null;
    expect(data?.damageType).toBe("slashing");
  });

  it("persists raw die faces when provided", async () => {
    const sessionId = await startSession();

    const attackRes = await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl(`/${sessionId}/roll`))
      .send({ kind: "attack", source: "Longsword", total: 17, specLabel: "1d20+5", faces: [12] });
    expect(attackRes.status).toBe(201);

    const damageRes = await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl(`/${sessionId}/roll`))
      .send({ kind: "damage", source: "Longsword", total: 8, faces: [3, 5] });
    expect(damageRes.status).toBe(201);

    const attack = await prisma.characterEvent.findFirst({
      where: { characterId: FIXTURE_ID, type: "attackRoll" },
    });
    expect((attack?.data as { faces: number[] } | null)?.faces).toEqual([12]);

    const damage = await prisma.characterEvent.findFirst({
      where: { characterId: FIXTURE_ID, type: "damageRoll" },
    });
    expect((damage?.data as { faces: number[] } | null)?.faces).toEqual([3, 5]);
  });

  it("stores faces as null when omitted and still 201s", async () => {
    const sessionId = await startSession();

    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl(`/${sessionId}/roll`))
      .send({ kind: "attack", source: "Longsword", total: 17 });
    expect(res.status).toBe(201);

    const event = await prisma.characterEvent.findFirst({
      where: { characterId: FIXTURE_ID, type: "attackRoll" },
    });
    expect((event?.data as { faces: number[] | null } | null)?.faces).toBeNull();
  });

  it("400s for non-integer faces", async () => {
    const sessionId = await startSession();
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl(`/${sessionId}/roll`))
      .send({ kind: "attack", source: "Longsword", total: 17, faces: [1.5] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/faces/);
  });

  it("400s for an invalid kind", async () => {
    const sessionId = await startSession();
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl(`/${sessionId}/roll`))
      .send({ kind: "crit", source: "Axe", total: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/kind/);
  });

  it("400s for an empty source", async () => {
    const sessionId = await startSession();
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl(`/${sessionId}/roll`))
      .send({ kind: "attack", source: "  ", total: 12 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/source/);
  });

  it("400s when total is not a number", async () => {
    const sessionId = await startSession();
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(sessionsUrl(`/${sessionId}/roll`))
      .send({ kind: "damage", source: "Sword", total: "high" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/total/);
  });
});

// ── sessionId threading ───────────────────────────────────────────────────────
// A mutation made while a session is active should tag its CharacterEvent
// with the active sessionId.

describe("sessionId threading", () => {
  it("HP damage event carries the active sessionId", async () => {
    const startRes = await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl()).send({});
    const sessionId = startRes.body.session.id as string;

    // Perform an HP mutation via the hitpoints domain endpoint.
    const hpRes = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/hp`)
      .send({ operations: [{ type: "damage", amount: 5 }] });
    expect(hpRes.status).toBe(200);

    // The damage CharacterEvent should be tagged with the active sessionId.
    const event = await prisma.characterEvent.findFirst({
      where: { characterId: FIXTURE_ID, type: "damage" },
    });
    expect(event).not.toBeNull();
    expect(event?.sessionId).toBe(sessionId);
  });

  it("HP damage event has no sessionId when no session is active", async () => {
    const hpRes = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/hp`)
      .send({ operations: [{ type: "damage", amount: 5 }] });
    expect(hpRes.status).toBe(200);

    const event = await prisma.characterEvent.findFirst({
      where: { characterId: FIXTURE_ID, type: "damage" },
    });
    expect(event).not.toBeNull();
    expect(event?.sessionId).toBeNull();
  });
});

// ── Session journals in the recap (issue #45 part C) ──────────────────────────

describe("session journals returned with the ended session", () => {
  it("end response and GET include journalEntries linked by sessionId", async () => {
    const startRes = await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl()).send({});
    const sessionId = startRes.body.session.id as string;

    // Write a journal entry tagged to this session (and one that isn't).
    const tagged = await prisma.journalEntry.create({
      data: {
        characterId: FIXTURE_ID,
        sessionId,
        title: "The Sunken Library",
        date: new Date("2026-06-22T00:00:00.000Z"),
        body: "We found a hidden door.",
      },
    });
    await prisma.journalEntry.create({
      data: {
        characterId: FIXTURE_ID,
        sessionId: null,
        title: "Unrelated note",
        date: new Date("2026-06-21T00:00:00.000Z"),
        body: "Not part of any session.",
      },
    });

    const endRes = await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl(`/${sessionId}/end`)).send({});
    expect(endRes.status).toBe(200);
    expect(Array.isArray(endRes.body.session.journalEntries)).toBe(true);
    expect(endRes.body.session.journalEntries).toHaveLength(1);
    expect(endRes.body.session.journalEntries[0].id).toBe(tagged.id);
    expect(endRes.body.session.journalEntries[0].title).toBe("The Sunken Library");

    // GET the session detail — also carries journalEntries.
    const getRes = await supertest.agent(app).set("Cookie", COOKIE).get(sessionsUrl(`/${sessionId}`));
    expect(getRes.status).toBe(200);
    expect(getRes.body.journalEntries).toHaveLength(1);
    expect(getRes.body.journalEntries[0].id).toBe(tagged.id);
  });
});

// ── XP at end + retroactive XP to a past session (issue #45 parts A & B) ──────

describe("XP awarded during a session shows in summary.xpGained", () => {
  it("award before end flows into the recap", async () => {
    const startRes = await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl()).send({});
    const sessionId = startRes.body.session.id as string;

    // Award while active → auto-tagged with this sessionId.
    await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/experience`)
      .send({ operations: [{ type: "award", amount: 300 }] });

    const endRes = await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl(`/${sessionId}/end`)).send({});
    expect(endRes.status).toBe(200);
    expect(endRes.body.session.summary.xpGained).toBe(300);
  });
});

describe("retroactive XP to a past (ended) session", () => {
  it("tags the award to the explicit sessionId, recomputes that session's summary, and is audited", async () => {
    // Start and immediately end a session — no XP yet.
    const startRes = await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl()).send({});
    const sessionId = startRes.body.session.id as string;
    const endRes = await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl(`/${sessionId}/end`)).send({});
    expect(endRes.body.session.summary.xpGained).toBe(0);

    // Retroactively award XP to the now-ended session via the explicit override.
    const awardRes = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/experience`)
      .send({ operations: [{ type: "award", amount: 750 }], sessionId });
    expect(awardRes.status).toBe(200);
    // The serialized character reflects the new total XP.
    expect(awardRes.body.experiencePoints).toBe(FIXTURE.experiencePoints + 750);

    // The xpAward event is tagged with the past session and audited (before/after).
    const event = await prisma.characterEvent.findFirst({
      where: { characterId: FIXTURE_ID, type: "xpAward" },
    });
    expect(event?.sessionId).toBe(sessionId);
    expect((event?.before as { experiencePoints: number }).experiencePoints).toBe(
      FIXTURE.experiencePoints,
    );
    expect((event?.after as { experiencePoints: number }).experiencePoints).toBe(
      FIXTURE.experiencePoints + 750,
    );

    // That session's persisted summary now reflects the award.
    const getRes = await supertest.agent(app).set("Cookie", COOKIE).get(sessionsUrl(`/${sessionId}`));
    expect(getRes.body.summary.xpGained).toBe(750);

    // Events tagged to a COMPLETED session are intentionally frozen — the undo
    // path (LIFO) excludes them so the recap stays coherent. The retroactive
    // award is audited but not undoable; mid-session awards (still active) are.
    const batchId = event?.batchId as string;
    const undoRes = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/events/${batchId}/revert`)
      .send({});
    expect(undoRes.status).toBe(409);
  });

  it("a mid-session XP award is undoable before the session ends", async () => {
    const startRes = await supertest.agent(app).set("Cookie", COOKIE).post(sessionsUrl()).send({});
    const sessionId = startRes.body.session.id as string;

    const awardRes = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/experience`)
      .send({ operations: [{ type: "award", amount: 200 }] });
    expect(awardRes.status).toBe(200);

    const event = await prisma.characterEvent.findFirst({
      where: { characterId: FIXTURE_ID, type: "xpAward" },
    });
    expect(event?.sessionId).toBe(sessionId);
    const batchId = event?.batchId as string;

    // Still active → undoable.
    const undoRes = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/events/${batchId}/revert`)
      .send({});
    expect(undoRes.status).toBe(200);

    const character = await prisma.character.findUniqueOrThrow({
      where: { id: FIXTURE_ID },
      select: { experiencePoints: true },
    });
    expect(character.experiencePoints).toBe(FIXTURE.experiencePoints);
  });

  it("400s when the sessionId belongs to a different character", async () => {
    // Create a throwaway character + session it owns.
    const otherId = "test-sessions-character-other";
    await prisma.character.create({
      data: { ...FIXTURE, id: otherId, name: "Other", ownerId: OWNER_ID, spellcasting: Prisma.JsonNull },
    });
    try {
      const startRes = await supertest.agent(app).set("Cookie", COOKIE)
        .post(`/api/characters/${otherId}/sessions`)
        .send({});
      const otherSessionId = startRes.body.session.id as string;

      const res = await supertest.agent(app).set("Cookie", COOKIE)
        .post(`/api/characters/${FIXTURE_ID}/experience`)
        .send({ operations: [{ type: "award", amount: 100 }], sessionId: otherSessionId });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/session not found/i);
    } finally {
      await prisma.character.deleteMany({ where: { id: otherId } });
    }
  });
});
