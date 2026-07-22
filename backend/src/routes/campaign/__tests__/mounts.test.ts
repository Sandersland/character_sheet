/**
 * Router mount map (#501). Pins the owned-path + mergeParams refactor: external
 * URLs are unchanged, so every documented route must still resolve to its
 * handler. Two invariants:
 *   1. Hybrid routers (maneuvers/shadow-arts) still serve their
 *      catalog GET at the top level (/api/<name>), not under /characters/:id.
 *   2. Every character-scoped route reaches its handler with `:id` merged in —
 *      proven by a bogus id yielding the domain 404 ("Character not found",
 *      from assertCharacterAccess) rather than the catch-all ("Not found").
 */

import { beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-mounts";
let COOKIE: string;
const MISSING_ID = "mounts-nonexistent-character";

beforeAll(async () => {
  COOKIE = await authCookie(OWNER_ID);
});

function agent() {
  return supertest.agent(createApp()).set("Cookie", COOKIE);
}

describe("hybrid catalog routers stay top-level", () => {
  it.each(["/api/maneuvers", "/api/shadow-arts"])(
    "GET %s returns a catalog array",
    async (url) => {
      const res = await agent().get(url);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    },
  );
});

describe("character-scoped routes resolve to their handler with :id merged", () => {
  const post = (path: string) => agent().post(`/api/characters/${MISSING_ID}${path}`).send({ operations: [] });
  const get = (path: string) => agent().get(`/api/characters/${MISSING_ID}${path}`);

  it.each([
    ["POST /hp", () => post("/hp")],
    ["POST /inventory/transactions", () => post("/inventory/transactions")],
    ["POST /spellcasting/transactions", () => post("/spellcasting/transactions")],
    ["POST /resources/transactions", () => post("/resources/transactions")],
    ["POST /conditions/transactions", () => post("/conditions/transactions")],
    ["POST /advancement/transactions", () => post("/advancement/transactions")],
    ["POST /class/transactions", () => post("/class/transactions")],
    ["POST /experience", () => post("/experience")],
    ["POST /actions/transactions", () => post("/actions/transactions")],
    ["POST /maneuvers/transactions", () => post("/maneuvers/transactions")],
    ["POST /elements/transactions", () => post("/elements/transactions")],
    ["POST /shadow-arts/transactions", () => post("/shadow-arts/transactions")],
    ["POST /channel-divinity/transactions", () => post("/channel-divinity/transactions")],
    ["GET /channel-divinity", () => get("/channel-divinity")],
    ["GET /activity", () => get("/activity")],
    ["POST /events/:batchId/revert", () => agent().post(`/api/characters/${MISSING_ID}/events/some-batch/revert`).send()],
  ])("%s hits the handler (domain 404, not catch-all)", async (_label, call) => {
    const res = await call();
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Character not found");
  });
});
