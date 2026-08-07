import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { ensureTestOwner } from "@/test-support/owner.js";

// Owned-CRUD for user homebrew spells (#1785, epic #1782 2/5): campaign-style
// ownership-scoped plain REST, real Postgres via supertest against the shared
// `app`. File-prefixed fixture ids keep it parallel-safe on the shared dev DB.

const OWNER = "owner-custom-spells-owner";
const OUTSIDER = "owner-custom-spells-outsider";

let cookieOwner: string;
let cookieOutsider: string;

const agent = (cookie: string) => supertest.agent(app).set("Cookie", cookie);

const VALID_SPELL = {
  name: "Test Bolt",
  level: 1,
  school: "evocation",
  castingTime: "1 action",
  range: "60 feet",
  duration: "Instantaneous",
  description: "A bolt of test energy.",
  classes: ["wizard"],
  effectKind: "damage",
  effectDiceCount: 2,
  effectDiceFaces: 6,
  damageType: "force",
  attackType: "attack",
};

beforeAll(async () => {
  await ensureTestOwner(OWNER);
  await ensureTestOwner(OUTSIDER);
  cookieOwner = await authCookie(OWNER);
  cookieOutsider = await authCookie(OUTSIDER);
});

afterAll(async () => {
  await prisma.spell.deleteMany({ where: { ownerId: { in: [OWNER, OUTSIDER] } } });
  await prisma.user.deleteMany({ where: { id: { in: [OWNER, OUTSIDER] } } });
});

describe("POST /api/spells/custom", () => {
  it("creates a spell with ownerId/edition forced + SpellClass rows written", async () => {
    const res = await agent(cookieOwner).post("/api/spells/custom").send(VALID_SPELL);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      ownerId: OWNER,
      edition: "EDITION_2014",
      name: "Test Bolt",
      classes: ["wizard"],
    });

    const row = await prisma.spell.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.ownerId).toBe(OWNER);
    expect(row.edition).toBe("EDITION_2014");

    const memberships = await prisma.spellClass.findMany({ where: { spellId: res.body.id } });
    expect(memberships.map((m) => m.className)).toEqual(["wizard"]);
  });

  it("ignores a client-supplied ownerId/edition (strict schema 400s instead)", async () => {
    const res = await agent(cookieOwner)
      .post("/api/spells/custom")
      .send({ ...VALID_SPELL, name: "Sneaky Spell", ownerId: OUTSIDER, edition: "EDITION_2024" });
    expect(res.status).toBe(400);
  });

  it("400s a level outside 0-9", async () => {
    const res = await agent(cookieOwner)
      .post("/api/spells/custom")
      .send({ ...VALID_SPELL, name: "Out Of Range", level: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/level/i);
  });

  it("400s effectKind without dice fields", async () => {
    const { effectDiceCount, effectDiceFaces, ...rest } = VALID_SPELL;
    void effectDiceCount;
    void effectDiceFaces;
    const res = await agent(cookieOwner)
      .post("/api/spells/custom")
      .send({ ...rest, name: "Half Baked" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/effectDiceCount/);
  });

  it("400s attackType save without saveAbility", async () => {
    const { attackType, ...rest } = VALID_SPELL;
    void attackType;
    const res = await agent(cookieOwner)
      .post("/api/spells/custom")
      .send({ ...rest, name: "Missing Save", attackType: "save" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/saveAbility/);
  });

  it("400s attackType attack with a save field set", async () => {
    const res = await agent(cookieOwner)
      .post("/api/spells/custom")
      .send({ ...VALID_SPELL, name: "Contradiction", attackType: "attack", saveAbility: "dexterity" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/attackType is "attack"/);
  });

  it("400s an unknown class name", async () => {
    const res = await agent(cookieOwner)
      .post("/api/spells/custom")
      .send({ ...VALID_SPELL, name: "Bad Class", classes: ["not-a-real-class"] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown class/);
  });

  it("creates a spell with no effect fields (utility spell) and no classes", async () => {
    const res = await agent(cookieOwner).post("/api/spells/custom").send({
      name: "Test Detect Nonsense",
      level: 0,
      school: "divination",
      castingTime: "1 action",
      range: "Self",
      duration: "1 minute",
      description: "Detects nonsense.",
      classes: [],
    });
    expect(res.status).toBe(201);
    expect(res.body.classes).toEqual([]);
    expect(res.body.effectKind).toBeUndefined();
  });
});

describe("PATCH /api/spells/custom/:id", () => {
  it("lets the owner edit their spell, reconciling SpellClass rows", async () => {
    const created = await agent(cookieOwner)
      .post("/api/spells/custom")
      .send({ ...VALID_SPELL, name: "Patchable Spell", classes: ["wizard"] });
    const id = created.body.id as string;

    const patched = await agent(cookieOwner)
      .patch(`/api/spells/custom/${id}`)
      .send({ ...VALID_SPELL, name: "Patched Spell", classes: ["wizard", "sorcerer"] });
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe("Patched Spell");
    expect(patched.body.classes.sort()).toEqual(["sorcerer", "wizard"]);

    const memberships = await prisma.spellClass.findMany({ where: { spellId: id } });
    expect(memberships.map((m) => m.className).sort()).toEqual(["sorcerer", "wizard"]);
  });

  it("404s an id that doesn't exist", async () => {
    const res = await agent(cookieOwner)
      .patch("/api/spells/custom/does-not-exist")
      .send(VALID_SPELL);
    expect(res.status).toBe(404);
  });

  it("403s a different user's edit attempt", async () => {
    const created = await agent(cookieOwner)
      .post("/api/spells/custom")
      .send({ ...VALID_SPELL, name: "Owned By Owner" });
    const id = created.body.id as string;

    const res = await agent(cookieOutsider)
      .patch(`/api/spells/custom/${id}`)
      .send({ ...VALID_SPELL, name: "Hijacked" });
    expect(res.status).toBe(403);
  });

  it("400s an incoherent edit the same way create does", async () => {
    const created = await agent(cookieOwner)
      .post("/api/spells/custom")
      .send({ ...VALID_SPELL, name: "Edit Coherence Check" });
    const id = created.body.id as string;

    const res = await agent(cookieOwner)
      .patch(`/api/spells/custom/${id}`)
      .send({ ...VALID_SPELL, name: "Edit Coherence Check", level: -1 });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/spells/custom/:id", () => {
  it("lets the owner delete their spell, cascading its SpellClass rows", async () => {
    const created = await agent(cookieOwner)
      .post("/api/spells/custom")
      .send({ ...VALID_SPELL, name: "Deletable Spell" });
    const id = created.body.id as string;

    const res = await agent(cookieOwner).delete(`/api/spells/custom/${id}`);
    expect(res.status).toBe(204);

    expect(await prisma.spell.findUnique({ where: { id } })).toBeNull();
    expect(await prisma.spellClass.findMany({ where: { spellId: id } })).toEqual([]);
  });

  it("404s an id that doesn't exist", async () => {
    const res = await agent(cookieOwner).delete("/api/spells/custom/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("403s a different user's delete attempt", async () => {
    const created = await agent(cookieOwner)
      .post("/api/spells/custom")
      .send({ ...VALID_SPELL, name: "Protected Spell" });
    const id = created.body.id as string;

    const res = await agent(cookieOutsider).delete(`/api/spells/custom/${id}`);
    expect(res.status).toBe(403);

    expect(await prisma.spell.findUnique({ where: { id } })).not.toBeNull();
  });
});
