/**
 * PATCH /api/preferences (#1178). Real Postgres, supertest against createApp()
 * — same authCookie + ensureTestOwner harness pattern used by other route tests.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { ensureTestOwner } from "@/test-support/owner.js";

const OWNER = "prefs-route-owner";

const agent = (cookie: string) => supertest.agent(app).set("Cookie", cookie);

let cookie: string;

describe("PATCH /api/preferences (#1178)", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER);
    cookie = await authCookie(OWNER);
    // Reset to "never stored" before each test so cases don't bleed into each other.
    await prisma.user.update({ where: { id: OWNER }, data: { preferences: Prisma.DbNull } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: OWNER } });
  });

  it("401s without a session cookie", async () => {
    const res = await supertest(app).patch("/api/preferences").send({ theme: "dark" });
    expect(res.status).toBe(401);
  });

  it("stores a single-key patch and returns the defaulted-merged preferences", async () => {
    const res = await agent(cookie).patch("/api/preferences").send({ theme: "dark" });
    expect(res.status).toBe(200);
    expect(res.body.preferences).toEqual({
      theme: "dark",
      diceRollStyle: "animated",
      autoRollConcentration: true,
    });

    const row = await prisma.user.findUniqueOrThrow({ where: { id: OWNER } });
    expect(row.preferences).toEqual({ theme: "dark" });
  });

  it("a partial patch updates only the named key and leaves the others", async () => {
    await agent(cookie)
      .patch("/api/preferences")
      .send({ theme: "dark", diceRollStyle: "quick", autoRollConcentration: false });

    const res = await agent(cookie).patch("/api/preferences").send({ theme: "light" });
    expect(res.status).toBe(200);
    expect(res.body.preferences).toEqual({
      theme: "light",
      diceRollStyle: "quick",
      autoRollConcentration: false,
    });

    const row = await prisma.user.findUniqueOrThrow({ where: { id: OWNER } });
    expect(row.preferences).toEqual({
      theme: "light",
      diceRollStyle: "quick",
      autoRollConcentration: false,
    });
  });

  it("rejects an unknown key (strict schema, 400)", async () => {
    const res = await agent(cookie).patch("/api/preferences").send({ bogus: true });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid enum value (400)", async () => {
    const res = await agent(cookie).patch("/api/preferences").send({ theme: "purple" });
    expect(res.status).toBe(400);
  });

  it("a hostile stored base never re-persists its unknown keys", async () => {
    await prisma.user.update({
      where: { id: OWNER },
      data: { preferences: JSON.parse('{"theme":"dark","__proto__":{"x":1},"constructor":{"prototype":{"x":1}}}') },
    });

    const res = await agent(cookie).patch("/api/preferences").send({ diceRollStyle: "quick" });
    expect(res.status).toBe(200);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: OWNER } });
    expect(row.preferences).toEqual({ theme: "dark", diceRollStyle: "quick" });
  });

  it("concurrent patches of different keys all survive (no lost update)", async () => {
    const [a, b, c] = await Promise.all([
      agent(cookie).patch("/api/preferences").send({ theme: "dark" }),
      agent(cookie).patch("/api/preferences").send({ diceRollStyle: "quick" }),
      agent(cookie).patch("/api/preferences").send({ autoRollConcentration: false }),
    ]);
    expect([a.status, b.status, c.status]).toEqual([200, 200, 200]);

    // FOR UPDATE serializes the three: each takes the row lock, reads the keys
    // written so far, merges its own. Drop the lock and they all read the same
    // "never stored" base and the last writer lands with only its own key.
    // Asserted on the stored row rather than a response because every response
    // looks correct in isolation either way — a lost write only shows up here.
    const row = await prisma.user.findUniqueOrThrow({ where: { id: OWNER } });
    expect(row.preferences).toEqual({
      theme: "dark",
      diceRollStyle: "quick",
      autoRollConcentration: false,
    });
  });

  it("accepts an empty patch as a no-op", async () => {
    const res = await agent(cookie).patch("/api/preferences").send({});
    expect(res.status).toBe(200);
    expect(res.body.preferences).toEqual({
      theme: "system",
      diceRollStyle: "animated",
      autoRollConcentration: true,
    });
  });
});
