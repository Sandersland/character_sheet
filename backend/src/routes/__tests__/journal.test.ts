/**
 * Journal CRUD route integration tests. Plain REST (no transaction/audit
 * pattern) — each mutation returns the full serialized character, with
 * journal entries surfaced under `character.journal` (newest-first).
 *
 * Mirrors sessions.test.ts: real Postgres in beforeEach, supertest against
 * createApp(). JournalEntry rows cascade-delete with the character, so
 * afterEach only deletes the character row.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { visibleEntries } from "../journal.js";
import { ensureTestOwner } from "../../test-support/owner.js";
import { authCookie } from "../../test-support/auth.js";

const FIXTURE_ID = "test-journal-character-1";
const OWNER_ID = "owner-journal";
let COOKIE: string;

const FIXTURE = {
  id: FIXTURE_ID,
  name: "Journal Test Rogue",
  alignment: "Chaotic Neutral",
  experiencePoints: 900,
  armorClass: 14,
  initiativeBonus: 3,
  speed: 30,
  hitPoints: { current: 21, max: 21, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 3, die: "d8", spent: 0 },
  abilityScores: {
    strength: 10,
    dexterity: 16,
    constitution: 13,
    intelligence: 12,
    wisdom: 10,
    charisma: 14,
  },
  savingThrowProficiencies: ["dexterity", "intelligence"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 25, pp: 0 },
};

const app = createApp();

function journalUrl(suffix = "") {
  return `/api/characters/${FIXTURE_ID}/journal${suffix}`;
}

beforeEach(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
  await prisma.character.create({ data: { ...FIXTURE, ownerId: OWNER_ID, spellcasting: Prisma.JsonNull } });
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
});

// ── Create ─────────────────────────────────────────────────────────────────

describe("POST /api/characters/:id/journal — create entry", () => {
  it("creates an entry and returns the updated character with it under journal", async () => {
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(journalUrl())
      .send({ title: "The Sunken Library", date: "2026-06-22", body: "Found three tomes." });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(FIXTURE_ID);
    expect(res.body.journal).toHaveLength(1);
    expect(res.body.journal[0].title).toBe("The Sunken Library");
    expect(res.body.journal[0].body).toBe("Found three tomes.");
    // date is round-tripped as an ISO string.
    expect(res.body.journal[0].date).toMatch(/^2026-06-22T/);
    expect(typeof res.body.journal[0].id).toBe("string");
  });

  it("persists the entry to the JournalEntry table", async () => {
    await supertest.agent(app).set("Cookie", COOKIE)
      .post(journalUrl())
      .send({ title: "A Debt Repaid", date: "2026-06-23", body: "Helped the militia." });

    const rows = await prisma.journalEntry.findMany({ where: { characterId: FIXTURE_ID } });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("A Debt Repaid");
  });

  it("400s on a missing required field (empty title)", async () => {
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(journalUrl())
      .send({ title: "", date: "2026-06-22", body: "x" });
    expect(res.status).toBe(400);
  });

  it("404s for an unknown character", async () => {
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post("/api/characters/does-not-exist/journal")
      .send({ title: "x", date: "2026-06-22", body: "y" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Character not found");
  });

  it("400s on a tz-offset datetime (only yyyy-mm-dd calendar dates allowed)", async () => {
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(journalUrl())
      .send({ title: "Off by one?", date: "2026-06-22T23:00:00-05:00", body: "x" });
    expect(res.status).toBe(400);
  });

  it("pins a yyyy-mm-dd date to UTC midnight", async () => {
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(journalUrl())
      .send({ title: "Midnight", date: "2026-06-22", body: "x" });
    expect(res.status).toBe(201);
    expect(res.body.journal[0].date).toBe("2026-06-22T00:00:00.000Z");
  });

  it("sets authorUserId to the requesting user on create", async () => {
    await supertest.agent(app).set("Cookie", COOKIE)
      .post(journalUrl())
      .send({ title: "Authored", date: "2026-06-22", body: "by me" });

    const rows = await prisma.journalEntry.findMany({ where: { characterId: FIXTURE_ID } });
    expect(rows).toHaveLength(1);
    expect(rows[0].authorUserId).toBe(OWNER_ID);
    expect(rows[0].visibility).toBe("PRIVATE");
  });
});

// ── Capture notes ─────────────────────────────────────────────────────────────

describe("POST /api/characters/:id/journal — capture NOTE rows", () => {
  it("creates a NOTE with no title (and no date) → 201", async () => {
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(journalUrl())
      .send({ kind: "NOTE", body: "The bridge collapsed!" });

    expect(res.status).toBe(201);
    expect(res.body.journal).toHaveLength(1);
    expect(res.body.journal[0].kind).toBe("NOTE");
    expect(res.body.journal[0].title).toBeUndefined();
    expect(res.body.journal[0].body).toBe("The bridge collapsed!");
    expect(typeof res.body.journal[0].loggedAt).toBe("string");
  });

  it("auto-attaches a NOTE to the character's active session when one exists", async () => {
    const session = await prisma.session.create({
      data: { characterId: FIXTURE_ID, status: "active" },
    });

    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(journalUrl())
      .send({ kind: "NOTE", body: "mid-session jot" });

    expect(res.status).toBe(201);
    expect(res.body.journal[0].sessionId).toBe(session.id);
  });

  it("leaves sessionId null for a NOTE when no session is active", async () => {
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(journalUrl())
      .send({ kind: "NOTE", body: "between sessions" });

    expect(res.status).toBe(201);
    expect(res.body.journal[0].sessionId).toBeUndefined();
  });
});

// ── visibleEntries (private-by-default read path) ─────────────────────────────

describe("visibleEntries", () => {
  it("returns only the author's own entries", async () => {
    await prisma.journalEntry.create({
      data: {
        characterId: FIXTURE_ID,
        kind: "NOTE",
        date: new Date("2026-06-22T00:00:00.000Z"),
        body: "mine",
        authorUserId: OWNER_ID,
      },
    });
    await prisma.journalEntry.create({
      data: {
        characterId: FIXTURE_ID,
        kind: "NOTE",
        date: new Date("2026-06-22T00:00:00.000Z"),
        body: "someone else's private note",
        authorUserId: "other-user",
      },
    });

    const mine = await visibleEntries(prisma, OWNER_ID, { id: FIXTURE_ID });
    expect(mine).toHaveLength(1);
    expect(mine[0].body).toBe("mine");

    const theirs = await visibleEntries(prisma, "other-user", { id: FIXTURE_ID });
    expect(theirs).toHaveLength(1);
    expect(theirs[0].body).toBe("someone else's private note");
  });
});

// ── Update ─────────────────────────────────────────────────────────────────

describe("PATCH /api/characters/:id/journal/:entryId — update entry", () => {
  async function seedEntry() {
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(journalUrl())
      .send({ title: "Original", date: "2026-06-22", body: "Original body." });
    return res.body.journal[0].id as string;
  }

  it("partially updates the entry (body only) and returns the character", async () => {
    const entryId = await seedEntry();
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .patch(journalUrl(`/${entryId}`))
      .send({ body: "Edited body." });

    expect(res.status).toBe(200);
    expect(res.body.journal).toHaveLength(1);
    expect(res.body.journal[0].title).toBe("Original"); // unchanged
    expect(res.body.journal[0].body).toBe("Edited body.");
  });

  it("404s for an unknown character", async () => {
    const entryId = await seedEntry();
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .patch(`/api/characters/does-not-exist/journal/${entryId}`)
      .send({ body: "x" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Character not found");
  });

  it("404s when the entry doesn't belong to the character", async () => {
    await seedEntry();
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .patch(journalUrl("/not-a-real-entry-id"))
      .send({ body: "x" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Journal entry not found");
  });
});

// ── Delete ─────────────────────────────────────────────────────────────────

describe("DELETE /api/characters/:id/journal/:entryId — delete entry", () => {
  async function seedEntry() {
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(journalUrl())
      .send({ title: "To Delete", date: "2026-06-22", body: "Goodbye." });
    return res.body.journal[0].id as string;
  }

  it("deletes the entry and returns the character without it", async () => {
    const entryId = await seedEntry();
    const res = await supertest.agent(app).set("Cookie", COOKIE).delete(journalUrl(`/${entryId}`));

    expect(res.status).toBe(200);
    expect(res.body.journal).toHaveLength(0);

    const rows = await prisma.journalEntry.findMany({ where: { characterId: FIXTURE_ID } });
    expect(rows).toHaveLength(0);
  });

  it("404s for an unknown character", async () => {
    const entryId = await seedEntry();
    const res = await supertest.agent(app).set("Cookie", COOKIE).delete(`/api/characters/does-not-exist/journal/${entryId}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Character not found");
  });

  it("404s when the entry doesn't belong to the character", async () => {
    await seedEntry();
    const res = await supertest.agent(app).set("Cookie", COOKIE).delete(journalUrl("/not-a-real-entry-id"));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Journal entry not found");
  });
});

// ── Ordering ─────────────────────────────────────────────────────────────────

describe("journal ordering", () => {
  it("returns entries newest-first by the user-entered date", async () => {
    await supertest.agent(app).set("Cookie", COOKIE)
      .post(journalUrl())
      .send({ title: "First", date: "2026-06-20", body: "a" });
    await supertest.agent(app).set("Cookie", COOKIE)
      .post(journalUrl())
      .send({ title: "Second", date: "2026-06-21", body: "b" });

    const res = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.journal.map((e: { title: string }) => e.title)).toEqual(["Second", "First"]);
  });

  it("orders by the entered date, not creation order (a back-dated entry sorts by its date)", async () => {
    // Created first, but with the LATEST date → must sort to the top.
    await supertest.agent(app).set("Cookie", COOKIE)
      .post(journalUrl())
      .send({ title: "Future", date: "2026-07-01", body: "written first, dated latest" });
    // Created second, but back-dated → must sort to the bottom.
    await supertest.agent(app).set("Cookie", COOKIE)
      .post(journalUrl())
      .send({ title: "Past", date: "2026-01-01", body: "written second, dated earliest" });

    const res = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.journal.map((e: { title: string }) => e.title)).toEqual(["Future", "Past"]);
  });
});
