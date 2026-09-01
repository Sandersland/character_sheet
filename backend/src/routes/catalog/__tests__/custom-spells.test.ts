import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import supertest from "supertest";

import { Prisma, type SpellSchool } from "@/generated/prisma/client.js";
import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { createTestCharacter } from "@/test-support/character.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import * as spellClassesModule from "@/lib/spellcasting/spell-classes.js";

const OWNER = "owner-custom-spells-owner";
const OUTSIDER = "owner-custom-spells-outsider";
const CAMPAIGN_DM = "owner-custom-spells-dm";
const CAMPAIGN_MEMBER = "owner-custom-spells-member";
const CAMPAIGN_ID = "test-custom-spells-campaign-1";
const CHAR_2014 = "test-custom-spells-char-2014";
const CHAR_2024 = "test-custom-spells-char-2024";
const CHAR_OUTSIDER = "test-custom-spells-char-outsider";

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
  await createTestCharacter(OWNER, { id: CHAR_2014, edition: "EDITION_2014", name: "Homebrew Author 2014" });
  await createTestCharacter(OWNER, { id: CHAR_2024, edition: "EDITION_2024", name: "Homebrew Author 2024" });
  await createTestCharacter(OUTSIDER, { id: CHAR_OUTSIDER, edition: "EDITION_2024", name: "Not Yours" });
});

afterAll(async () => {
  // Deleting CatalogEntry cascades the Spell row (ON DELETE CASCADE) — the reverse cascade doesn't exist, so spell.deleteMany alone would orphan the entry.
  await prisma.catalogEntry.deleteMany({ where: { ownerUserId: { in: [OWNER, OUTSIDER] } } });
  await prisma.catalogEntry.deleteMany({ where: { ownerCampaignId: CAMPAIGN_ID } });
  await prisma.campaign.deleteMany({ where: { id: CAMPAIGN_ID } });
  // Deleting the users cascades their characters (Character.owner onDelete: Cascade).
  await prisma.user.deleteMany({ where: { id: { in: [OWNER, OUTSIDER, CAMPAIGN_DM, CAMPAIGN_MEMBER] } } });
});

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

  // Mirrors spellSeedSchema's own multi-instance refines (#1981), enforced here by
  // validateCustomSpellCoherence — see its own unit tests for the pure-function cases.
  describe("multi-instance fields (#1981/#1984)", () => {
    it("creates and re-serves a homebrew spell with instanceCount + instanceRoll + upcastInstancesPerLevel", async () => {
      const res = await agent(cookieOwner)
        .post(`/api/spells/custom?characterId=${CHAR_2014}`)
        .send({
          ...VALID_SPELL,
          name: "Test Split Bolt",
          instanceCount: 3,
          instanceRoll: "each",
          upcastInstancesPerLevel: 1,
        });
      expect(res.status).toBe(201);
      expect(res.body.instanceCount).toBe(3);
      expect(res.body.instanceRoll).toBe("each");
      expect(res.body.upcastInstancesPerLevel).toBe(1);

      const row = await prisma.spell.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.instanceCount).toBe(3);
      expect(row.instanceRoll).toBe("each");
      expect(row.upcastInstancesPerLevel).toBe(1);
    });

    it("400s instanceRoll without instanceCount", async () => {
      const res = await agent(cookieOwner)
        .post(`/api/spells/custom?characterId=${CHAR_2014}`)
        .send({ ...VALID_SPELL, name: "Orphan Roll", instanceRoll: "once" });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/instanceRoll requires instanceCount/);
    });

    it("400s upcastInstancesPerLevel without instanceCount", async () => {
      const res = await agent(cookieOwner)
        .post(`/api/spells/custom?characterId=${CHAR_2014}`)
        .send({ ...VALID_SPELL, name: "Orphan Upcast", upcastInstancesPerLevel: 1 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/upcastInstancesPerLevel requires instanceCount/);
    });

    it("400s upcastInstancesPerLevel on a cantrip (level 0)", async () => {
      const { level: _level, ...rest } = VALID_SPELL;
      void _level;
      const res = await agent(cookieOwner)
        .post(`/api/spells/custom?characterId=${CHAR_2014}`)
        .send({ ...rest, name: "Cantrip Upcast", level: 0, instanceCount: 2, upcastInstancesPerLevel: 1 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/never legal on a cantrip/);
    });
  });
});

// Proves the custom-spell persistence path round-trips instanceCount/instanceRoll all the way to a
// character's served effectRolls, not just back to the create response — the wire seam #1984 must
// close (create → learn → GET all read the same Spell columns through the same shared helpers as a
// seeded catalog spell, see spell-effect-fields.ts). CHAR_2014 above carries no classEntries (a
// non-caster fixture, buildSpellcastingView returns undefined for it), so this needs its own
// caster fixture — mirrors spell-effect-rolls.test.ts's WIZARD_ID setup.
describe("a custom instanced spell round-trips through learn onto a character's effectRolls (#1984)", () => {
  const ROUND_TRIP_WIZARD_ID = "test-custom-spells-instance-wizard";
  const ROUND_TRIP_CLASS_NAME = "Custom Spells Instance Round Trip Wizard";

  beforeAll(async () => {
    const cls = await prisma.characterClass.upsert({
      where: { name: ROUND_TRIP_CLASS_NAME },
      create: {
        name: ROUND_TRIP_CLASS_NAME,
        hitDie: "d6",
        savingThrows: ["intelligence", "wisdom"],
        skillChoiceCount: 2,
        skillChoices: ["arcana"],
        isSpellcaster: true,
      },
      update: {},
    });
    await prisma.character.deleteMany({ where: { id: ROUND_TRIP_WIZARD_ID } });
    await prisma.character.create({
      data: {
        id: ROUND_TRIP_WIZARD_ID,
        name: "Custom Spells Instance Round Trip Wizard",
        ownerId: OWNER,
        rulesEdition: "EDITION_2024",
        alignment: "Neutral Good",
        experiencePoints: 0,
        initiativeBonus: 1,
        speed: 30,
        skills: [],
        toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        abilityScores: { strength: 8, dexterity: 12, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
        hitPoints: { current: 8, max: 8, temp: 0 },
        hitDice: { total: 1, die: "d6" },
        classEntries: { create: [{ name: "wizard", classId: cls.id, position: 0 }] },
      },
    });
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: ROUND_TRIP_WIZARD_ID } });
    await prisma.characterClass.deleteMany({ where: { name: ROUND_TRIP_CLASS_NAME } });
  });

  it("a custom instanced cantrip serves instanceCount/instanceRoll on its learned effectRolls entry", async () => {
    const created = await agent(cookieOwner)
      .post(`/api/spells/custom?characterId=${ROUND_TRIP_WIZARD_ID}`)
      .send({
        name: "Test Twin Ray",
        level: 0,
        school: "evocation",
        castingTime: "1 action",
        range: "60 feet",
        duration: "Instantaneous",
        description: "Two rays of test force.",
        classes: ["wizard"],
        effectKind: "damage",
        effectDiceCount: 1,
        effectDiceFaces: 6,
        damageType: "force",
        attackType: "attack",
        instanceCount: 2,
        instanceRoll: "once",
      });
    expect(created.status).toBe(201);

    const learned = await agent(cookieOwner)
      .post(`/api/characters/${ROUND_TRIP_WIZARD_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "learnSpell", spellId: created.body.id }] });
    expect(learned.status).toBe(200);

    const entry = (
      learned.body.spellcasting.spells as Array<{
        spellId?: string;
        instanceCount?: number;
        instanceRoll?: string;
        effectRolls?: unknown[];
      }>
    ).find((s) => s.spellId === created.body.id)!;
    expect(entry).toBeDefined();
    expect(entry.instanceCount).toBe(2);
    expect(entry.instanceRoll).toBe("once");
    expect(entry.effectRolls).toEqual([
      { slotLevel: 0, roll: { count: 1, faces: 6, modifier: 0 }, instanceCount: 2, instanceRoll: "once" },
    ]);
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

  // The full-field replace nulls instanceCount when the body omits it — a body that keeps
  // instanceRoll must hit the same coherence check create does, or an edit could strand it.
  it("400s an edit that drops instanceCount while keeping instanceRoll", async () => {
    const created = await agent(cookieOwner)
      .post(`/api/spells/custom?characterId=${CHAR_2014}`)
      .send({ ...VALID_SPELL, name: "Edit Incoherent", instanceCount: 3, instanceRoll: "each" });
    expect(created.status).toBe(201);

    const patched = await agent(cookieOwner)
      .patch(`/api/spells/custom/${created.body.id}`)
      .send({ ...VALID_SPELL, name: "Edit Incoherent", instanceRoll: "each" });
    expect(patched.status).toBe(400);
    expect(patched.body.error).toMatch(/instanceRoll requires instanceCount/);

    const row = await prisma.spell.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.instanceCount).toBe(3);
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

  // assertSpellOwnership runs inside the $transaction to close a TOCTOU window; a mid-transaction not-found must map to 404, never an uncaught 500 (#1815).
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
