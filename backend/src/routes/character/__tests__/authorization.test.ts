import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { ensureTestOwner } from "@/test-support/owner.js";

async function makeCharacter(id: string, ownerId: string) {
  await prisma.character.deleteMany({ where: { id } });
  await prisma.character.create({
    data: {
      id,
      name: `Char ${id}`,
      alignment: "True Neutral",
      ownerId,
      initiativeBonus: 0,
      speed: 30,
      hitPoints: { current: 10, max: 10, temp: 0 },
      hitDice: { total: 1, die: "d8" },
      abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      savingThrowProficiencies: [],
      skills: [],
      toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
    },
  });
}

const OWNER_ID = "owner-authz-gate";

describe("auth gate (requireAuth)", () => {
  let cookie: string;

  beforeAll(async () => {
    cookie = await authCookie(OWNER_ID);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: OWNER_ID } });
  });

  it("401s an unauthenticated request to a protected route", async () => {
    const res = await supertest(app).get("/api/characters");
    expect(res.status).toBe(401);
  });

  it("allows an authenticated request through the gate", async () => {
    const res = await supertest(app).get("/api/characters").set("Cookie", cookie);
    expect(res.status).toBe(200);
  });

  it("keeps GET /api/health public", async () => {
    const res = await supertest(app).get("/api/health");
    expect(res.status).toBe(200);
  });

  it("keeps GET /api/auth/providers public", async () => {
    const res = await supertest(app).get("/api/auth/providers");
    expect(res.status).toBe(200);
  });
});

describe("character ownership (#101)", () => {
  const OWNER_A = "owner-authz-a";
  const OWNER_B = "owner-authz-b";
  const CHAR_A = "test-authz-char-a";
  const CHAR_B = "test-authz-char-b";
  let cookieA: string;

  beforeAll(async () => {
    await ensureTestOwner(OWNER_A);
    await ensureTestOwner(OWNER_B);
    cookieA = await authCookie(OWNER_A);
    await makeCharacter(CHAR_A, OWNER_A);
    await makeCharacter(CHAR_B, OWNER_B);
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: { in: [CHAR_A, CHAR_B] } } });
    await prisma.user.deleteMany({ where: { id: { in: [OWNER_A, OWNER_B] } } });
  });

  it("GET /api/characters returns only the caller's characters", async () => {
    const res = await supertest(app).get("/api/characters").set("Cookie", cookieA);
    expect(res.status).toBe(200);
    expect((res.body as { id: string }[]).map((c) => c.id)).toEqual([CHAR_A]);
  });

  it("lets the owner read their own character", async () => {
    const res = await supertest(app).get(`/api/characters/${CHAR_A}`).set("Cookie", cookieA);
    expect(res.status).toBe(200);
  });

  it("403s reading a character owned by someone else", async () => {
    const res = await supertest(app).get(`/api/characters/${CHAR_B}`).set("Cookie", cookieA);
    expect(res.status).toBe(403);
  });

  it("403s PATCHing a character owned by someone else", async () => {
    const res = await supertest(app)
      .patch(`/api/characters/${CHAR_B}`)
      .set("Cookie", cookieA)
      .send({ name: "Hijacked" });
    expect(res.status).toBe(403);
  });

  it("403s DELETing a character owned by someone else", async () => {
    const res = await supertest(app)
      .delete(`/api/characters/${CHAR_B}`)
      .set("Cookie", cookieA);
    expect(res.status).toBe(403);
    const still = await prisma.character.findUnique({ where: { id: CHAR_B } });
    expect(still).not.toBeNull();
  });

  it("404s for a missing character (owner authenticated)", async () => {
    const res = await supertest(app)
      .get("/api/characters/does-not-exist")
      .set("Cookie", cookieA);
    expect(res.status).toBe(404);
  });
});

describe("character-scoped routers reject non-owners (#101)", () => {
  const OWNER_A = "owner-authz-routers-a";
  const OWNER_B = "owner-authz-routers-b";
  const CHAR_B = "test-authz-routers-char-b";
  let cookieA: string;

  // Ownership is checked before body parsing, so an empty body still yields 403 (never 400/404).
  const ROUTES: Array<{ method: "get" | "post"; suffix: string }> = [
    { method: "post", suffix: "/hp" },
    { method: "post", suffix: "/inventory/transactions" },
    { method: "post", suffix: "/experience" },
    { method: "post", suffix: "/spellcasting/transactions" },
    { method: "post", suffix: "/resources/transactions" },
    { method: "post", suffix: "/conditions/transactions" },
    { method: "post", suffix: "/class/transactions" },
    { method: "post", suffix: "/advancement/transactions" },
    { method: "post", suffix: "/actions/transactions" },
    { method: "post", suffix: "/abilities/stunning-strike/transactions" },
    { method: "get", suffix: "/activity" },
    { method: "get", suffix: "/sessions/active" },
    { method: "post", suffix: "/journal" },
  ];

  beforeAll(async () => {
    await ensureTestOwner(OWNER_A);
    await ensureTestOwner(OWNER_B);
    cookieA = await authCookie(OWNER_A);
    await makeCharacter(CHAR_B, OWNER_B);
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: CHAR_B } });
    await prisma.user.deleteMany({ where: { id: { in: [OWNER_A, OWNER_B] } } });
  });

  it.each(ROUTES)("403s $method $suffix for a non-owner", async ({ method, suffix }) => {
    const req = supertest(app)[method](`/api/characters/${CHAR_B}${suffix}`).set("Cookie", cookieA);
    const res = method === "post" ? await req.send({}) : await req;
    expect(res.status).toBe(403);
  });
});
