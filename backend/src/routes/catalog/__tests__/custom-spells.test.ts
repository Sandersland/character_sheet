import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import supertest from "supertest";

import { Prisma, type SpellSchool } from "@/generated/prisma/client.js";
import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import * as spellClassesModule from "@/lib/spellcasting/spell-classes.js";

// Owned-CRUD for user homebrew spells (#1785, epic #1782 2/5): campaign-style
// ownership-scoped plain REST, real Postgres via supertest against the shared
// `app`. File-prefixed fixture ids keep it parallel-safe on the shared dev DB.

const OWNER = "owner-custom-spells-owner";
const OUTSIDER = "owner-custom-spells-outsider";
const CAMPAIGN_DM = "owner-custom-spells-dm";
const CAMPAIGN_MEMBER = "owner-custom-spells-member";
const CAMPAIGN_ID = "test-custom-spells-campaign-1";
// #1819: the create endpoint derives the spell's edition from the authoring
// character (never a hardcoded default), so every create names one. OWNER owns
// both; CHAR_2014 keeps the pre-#1819 EDITION_2014 assertions valid, CHAR_2024
// exercises the derive-2024 path. CHAR_OUTSIDER (OUTSIDER's) drives the
// no-access rejection.
const CHAR_2014 = "test-custom-spells-char-2014";
const CHAR_2024 = "test-custom-spells-char-2024";
const CHAR_OUTSIDER = "test-custom-spells-char-outsider";

const BASE_CHAR = {
  alignment: "Neutral",
  experiencePoints: 0,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 10, max: 10, temp: 0 },
  hitDice: { total: 1, die: "d8" },
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

let cookieOwner: string;
let cookieOutsider: string;
let cookieDm: string;
let cookieMember: string;

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
  await ensureTestOwner(CAMPAIGN_DM);
  await ensureTestOwner(CAMPAIGN_MEMBER);
  cookieOwner = await authCookie(OWNER);
  cookieOutsider = await authCookie(OUTSIDER);
  cookieDm = await authCookie(CAMPAIGN_DM);
  cookieMember = await authCookie(CAMPAIGN_MEMBER);

  await prisma.campaign.deleteMany({ where: { id: CAMPAIGN_ID } });
  await prisma.campaign.create({
    data: {
      id: CAMPAIGN_ID,
      name: "Custom Spells DM Fixture",
      ownerId: CAMPAIGN_DM,
      inviteCode: `custom-spells-dm-${Date.now()}`,
      members: {
        create: [
          { userId: CAMPAIGN_DM, role: "OWNER" },
          { userId: CAMPAIGN_MEMBER, role: "PLAYER" },
        ],
      },
    },
  });

  await prisma.character.deleteMany({ where: { id: { in: [CHAR_2014, CHAR_2024, CHAR_OUTSIDER] } } });
  await prisma.character.create({
    data: { ...BASE_CHAR, id: CHAR_2014, name: "Homebrew Author 2014", ownerId: OWNER, rulesEdition: "EDITION_2014" },
  });
  await prisma.character.create({
    data: { ...BASE_CHAR, id: CHAR_2024, name: "Homebrew Author 2024", ownerId: OWNER, rulesEdition: "EDITION_2024" },
  });
  await prisma.character.create({
    data: { ...BASE_CHAR, id: CHAR_OUTSIDER, name: "Not Yours", ownerId: OUTSIDER, rulesEdition: "EDITION_2024" },
  });
});

afterAll(async () => {
  // Deleting the CatalogEntry cascades the Spell row (ON DELETE CASCADE,
  // #1796) — the reverse cascade doesn't exist (the supertype stays closed),
  // so a plain `spell.deleteMany` alone would orphan the entry.
  await prisma.catalogEntry.deleteMany({ where: { ownerUserId: { in: [OWNER, OUTSIDER] } } });
  await prisma.catalogEntry.deleteMany({ where: { ownerCampaignId: CAMPAIGN_ID } });
  await prisma.character.deleteMany({ where: { id: { in: [CHAR_2014, CHAR_2024, CHAR_OUTSIDER] } } });
  await prisma.campaign.deleteMany({ where: { id: CAMPAIGN_ID } });
  await prisma.user.deleteMany({ where: { id: { in: [OWNER, OUTSIDER, CAMPAIGN_DM, CAMPAIGN_MEMBER] } } });
});

// Creates a CAMPAIGN-scope CatalogEntry + Spell directly (mirroring
// forkContent's own shape, lib/catalog/fork.ts) rather than going through the
// real fork route — this file is about the edit/delete ownership gate
// (#1808), not the fork flow itself (covered by fork.ts's own tests).
async function createCampaignForkFixture(name: string): Promise<string> {
  const entry = await prisma.catalogEntry.create({
    data: { kind: "SPELL", scope: "CAMPAIGN", ownerCampaignId: CAMPAIGN_ID, name, edition: "EDITION_2014" },
  });
  const { classes: _classes, school, ...spellColumns } = VALID_SPELL;
  void _classes;
  const spell = await prisma.spell.create({
    data: { ...spellColumns, school: school as SpellSchool, name, edition: "EDITION_2014", catalogEntryId: entry.id },
  });
  return spell.id;
}

describe("POST /api/spells/custom", () => {
  // #1819: edition is server-derived from the authoring character, never a
  // hardcoded default — a 2024 character's homebrew must be EDITION_2024 so it
  // resolves into that character's own catalog picker/spellbook.
  it("derives EDITION_2024 from a 2024 authoring character (#1819)", async () => {
    const res = await agent(cookieOwner)
      .post(`/api/spells/custom?characterId=${CHAR_2024}`)
      .send({ ...VALID_SPELL, name: "Arcane Zap 2024" });
    expect(res.status).toBe(201);
    expect(res.body.edition).toBe("EDITION_2024");

    const row = await prisma.spell.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.edition).toBe("EDITION_2024");
    const entry = await prisma.catalogEntry.findUniqueOrThrow({ where: { id: row.catalogEntryId } });
    expect(entry.edition).toBe("EDITION_2024");
  });

  it("400s when characterId is missing (no edition authority) (#1819)", async () => {
    const res = await agent(cookieOwner).post("/api/spells/custom").send({ ...VALID_SPELL, name: "No Author" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/characterId/i);
  });

  it("rejects a characterId the caller doesn't own (#1819)", async () => {
    const res = await agent(cookieOwner)
      .post(`/api/spells/custom?characterId=${CHAR_OUTSIDER}`)
      .send({ ...VALID_SPELL, name: "Borrowed Edition" });
    expect(res.status).toBe(403);
  });

  it("creates a spell with a USER-scope CatalogEntry + edition forced + SpellClass rows written (#1796)", async () => {
    const res = await agent(cookieOwner).post(`/api/spells/custom?characterId=${CHAR_2014}`).send(VALID_SPELL);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      edition: "EDITION_2014",
      name: "Test Bolt",
      classes: ["wizard"],
      catalog: { scope: "USER", isFork: false, forkedFromId: null, editable: true },
    });

    const row = await prisma.spell.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.catalogEntryId).toBe(res.body.catalog.entryId);
    expect(row.edition).toBe("EDITION_2014");

    const entry = await prisma.catalogEntry.findUniqueOrThrow({ where: { id: row.catalogEntryId } });
    expect(entry.ownerUserId).toBe(OWNER);
    expect(entry.scope).toBe("USER");
    expect(entry.kind).toBe("SPELL");

    const memberships = await prisma.spellClass.findMany({ where: { spellId: res.body.id } });
    expect(memberships.map((m) => m.className)).toEqual(["wizard"]);
  });

  it("ignores a client-supplied ownerId/edition (strict schema 400s instead)", async () => {
    const res = await agent(cookieOwner)
      .post(`/api/spells/custom?characterId=${CHAR_2014}`)
      .send({ ...VALID_SPELL, name: "Sneaky Spell", ownerId: OUTSIDER, edition: "EDITION_2024" });
    expect(res.status).toBe(400);
  });

  it("400s a level outside 0-9", async () => {
    const res = await agent(cookieOwner)
      .post(`/api/spells/custom?characterId=${CHAR_2014}`)
      .send({ ...VALID_SPELL, name: "Out Of Range", level: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/level/i);
  });

  it("400s effectKind without dice fields", async () => {
    const { effectDiceCount, effectDiceFaces, ...rest } = VALID_SPELL;
    void effectDiceCount;
    void effectDiceFaces;
    const res = await agent(cookieOwner)
      .post(`/api/spells/custom?characterId=${CHAR_2014}`)
      .send({ ...rest, name: "Half Baked" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/effectDiceCount/);
  });

  it("400s attackType save without saveAbility", async () => {
    const { attackType, ...rest } = VALID_SPELL;
    void attackType;
    const res = await agent(cookieOwner)
      .post(`/api/spells/custom?characterId=${CHAR_2014}`)
      .send({ ...rest, name: "Missing Save", attackType: "save" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/saveAbility/);
  });

  it("400s attackType attack with a save field set", async () => {
    const res = await agent(cookieOwner)
      .post(`/api/spells/custom?characterId=${CHAR_2014}`)
      .send({ ...VALID_SPELL, name: "Contradiction", attackType: "attack", saveAbility: "dexterity" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/attackType is "attack"/);
  });

  it("400s an unknown class name", async () => {
    const res = await agent(cookieOwner)
      .post(`/api/spells/custom?characterId=${CHAR_2014}`)
      .send({ ...VALID_SPELL, name: "Bad Class", classes: ["not-a-real-class"] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown class/);
  });

  it("creates a spell with no effect fields (utility spell) and no classes", async () => {
    const res = await agent(cookieOwner).post(`/api/spells/custom?characterId=${CHAR_2014}`).send({
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
      .post(`/api/spells/custom?characterId=${CHAR_2014}`)
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
      .post(`/api/spells/custom?characterId=${CHAR_2014}`)
      .send({ ...VALID_SPELL, name: "Owned By Owner" });
    const id = created.body.id as string;

    const res = await agent(cookieOutsider)
      .patch(`/api/spells/custom/${id}`)
      .send({ ...VALID_SPELL, name: "Hijacked" });
    expect(res.status).toBe(403);
  });

  it("400s an incoherent edit the same way create does", async () => {
    const created = await agent(cookieOwner)
      .post(`/api/spells/custom?characterId=${CHAR_2014}`)
      .send({ ...VALID_SPELL, name: "Edit Coherence Check" });
    const id = created.body.id as string;

    const res = await agent(cookieOwner)
      .patch(`/api/spells/custom/${id}`)
      .send({ ...VALID_SPELL, name: "Edit Coherence Check", level: -1 });
    expect(res.status).toBe(400);
  });

  // A DM's CAMPAIGN-scope fork (#1808, epic #1795 8/8): assertSpellOwnership's
  // second admitted path, exercised through the real route rather than just
  // the access.test.ts unit.
  it("lets a campaign's DM edit a CAMPAIGN-scope fork they own", async () => {
    const id = await createCampaignForkFixture("DM Editable Fork");

    const res = await agent(cookieDm)
      .patch(`/api/spells/custom/${id}`)
      .send({ ...VALID_SPELL, name: "DM Edited Fork", effectDiceCount: 9, effectDiceFaces: 12 });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("DM Edited Fork");
    expect(res.body.effectDiceCount).toBe(9);
    expect(res.body.effectDiceFaces).toBe(12);
    expect(res.body.catalog).toMatchObject({ scope: "CAMPAIGN" });
  });

  it("403s a non-DM member's edit attempt on a CAMPAIGN-scope fork", async () => {
    const id = await createCampaignForkFixture("Member Cannot Edit");

    const res = await agent(cookieMember)
      .patch(`/api/spells/custom/${id}`)
      .send({ ...VALID_SPELL, name: "Hijacked Fork" });
    expect(res.status).toBe(403);
  });

  it("403s an outsider's edit attempt on a CAMPAIGN-scope fork", async () => {
    const id = await createCampaignForkFixture("Outsider Cannot Edit");

    const res = await agent(cookieOutsider)
      .patch(`/api/spells/custom/${id}`)
      .send({ ...VALID_SPELL, name: "Hijacked Fork" });
    expect(res.status).toBe(403);
  });

  it("403s an edit attempt on a seeded GLOBAL-scope spell", async () => {
    const globalSpell = await prisma.spell.findFirstOrThrow({
      where: { edition: "EDITION_2014" },
      orderBy: { name: "asc" },
    });

    const res = await agent(cookieOwner)
      .patch(`/api/spells/custom/${globalSpell.id}`)
      .send({ ...VALID_SPELL, name: "Hijacked Global" });
    expect(res.status).toBe(403);
  });

  // #1815 review finding 7: assertSpellOwnership used to run OUTSIDE the
  // $transaction, leaving a TOCTOU window where a concurrent DELETE between
  // the check and the write threw an uncaught P2025 (500). Moving the check
  // inside the transaction closes the large part of that window; this test
  // pins the remaining defense — a mid-transaction "record to update not
  // found" (simulated here via reconcileSpellClasses, which runs inside the
  // SAME transaction after the catalogEntry/spell updates) is caught and
  // mapped to a clean 404, never an uncaught 500.
  it("404s instead of 500ing on a mid-transaction record-not-found race (P2025)", async () => {
    const created = await agent(cookieOwner)
      .post(`/api/spells/custom?characterId=${CHAR_2014}`)
      .send({ ...VALID_SPELL, name: "Racy Patch Target" });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const spy = vi
      .spyOn(spellClassesModule, "reconcileSpellClasses")
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("Record to update not found.", {
          code: "P2025",
          clientVersion: "test",
        }),
      );
    try {
      const res = await agent(cookieOwner)
        .patch(`/api/spells/custom/${id}`)
        .send({ ...VALID_SPELL, name: "Should Not Apply" });
      expect(res.status).toBe(404);
    } finally {
      spy.mockRestore();
    }

    // The transaction rolled back — the rename above must not have applied.
    const row = await prisma.spell.findUniqueOrThrow({ where: { id } });
    expect(row.name).toBe("Racy Patch Target");
  });
});

describe("DELETE /api/spells/custom/:id", () => {
  it("lets the owner delete their spell, cascading its SpellClass rows", async () => {
    const created = await agent(cookieOwner)
      .post(`/api/spells/custom?characterId=${CHAR_2014}`)
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
      .post(`/api/spells/custom?characterId=${CHAR_2014}`)
      .send({ ...VALID_SPELL, name: "Protected Spell" });
    const id = created.body.id as string;

    const res = await agent(cookieOutsider).delete(`/api/spells/custom/${id}`);
    expect(res.status).toBe(403);

    expect(await prisma.spell.findUnique({ where: { id } })).not.toBeNull();
  });

  // A DM's CAMPAIGN-scope fork (#1808, epic #1795 8/8) — same second
  // admitted path as PATCH above.
  it("lets a campaign's DM delete a CAMPAIGN-scope fork they own", async () => {
    const id = await createCampaignForkFixture("DM Deletable Fork");

    const res = await agent(cookieDm).delete(`/api/spells/custom/${id}`);
    expect(res.status).toBe(204);

    expect(await prisma.spell.findUnique({ where: { id } })).toBeNull();
  });

  it("403s a non-DM member's delete attempt on a CAMPAIGN-scope fork", async () => {
    const id = await createCampaignForkFixture("Member Cannot Delete");

    const res = await agent(cookieMember).delete(`/api/spells/custom/${id}`);
    expect(res.status).toBe(403);

    expect(await prisma.spell.findUnique({ where: { id } })).not.toBeNull();
  });
});
