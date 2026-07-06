/**
 * Channel Divinity cast endpoint (#419): POST /channel-divinity/transactions and
 * GET /characters/:id/channel-divinity. Real Postgres + supertest. Fixtures are
 * single-class clerics/paladins whose XP sets the level; CD options are read from
 * the seeded catalog by name.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../../app.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../lib/prisma.js";
import { ensureTestOwner } from "../../../test-support/owner.js";
import { authCookie } from "../../../test-support/auth.js";

const OWNER_ID = "owner-cd-cast";
let COOKIE: string;

const FIXTURE_ID = "test-cd-cast-1";
const CLASS_NAME = "CD Test Class";

// XP thresholds → level: L2=300, L3=900, L6=14000.
const XP_L2 = 300;
const XP_L3 = 900;
const XP_L6 = 14000;

const url = `/api/characters/${FIXTURE_ID}/channel-divinity/transactions`;
const activityUrl = `/api/characters/${FIXTURE_ID}/activity?category=resources`;

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "CD Test Character",
  alignment: "Neutral",
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 30, max: 30, temp: 0 },
  hitDice: { total: 3, die: "d8" },
  abilityScores: {
    strength: 12, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 16, charisma: 16,
  },
  savingThrowProficiencies: ["wisdom", "charisma"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

function agent() {
  return supertest.agent(createApp()).set("Cookie", COOKIE);
}
async function cast(operations: unknown[]) {
  return agent().post(url).send({ operations });
}

interface ActivityEvent {
  type: string;
  summary: string;
  data?: Record<string, unknown>;
  batchId?: string;
}
async function activity(): Promise<ActivityEvent[]> {
  const res = await agent().get(activityUrl);
  return res.body as ActivityEvent[];
}

let classId: string;
const optionId: Record<string, string> = {};

async function loadOption(name: string) {
  optionId[name] = (await prisma.grantedAbility.findUnique({ where: { name } }))!.id;
}

async function createCharacter(experiencePoints: number, className: string, subclass: string | null) {
  await prisma.character.create({
    data: {
      ...FIXTURE_BASE,
      experiencePoints,
      ownerId: OWNER_ID,
      resources: Prisma.JsonNull,
      classEntries: { create: [{ name: className, subclass, classId, position: 0 }] },
    },
  });
}

function cdUsed(body: { resources: { pools: { key: string; used: number }[] } }): number {
  return body.resources.pools.find((p) => p.key === "channelDivinity")!.used;
}

describe("Channel Divinity cast endpoint", () => {
  beforeAll(async () => {
    const cls = await prisma.characterClass.upsert({
      where: { name: CLASS_NAME },
      create: { name: CLASS_NAME, hitDie: "d8", savingThrows: ["wisdom", "charisma"], skillChoiceCount: 2, skillChoices: ["insight", "religion"], isSpellcaster: true },
      update: {},
    });
    classId = cls.id;
    await Promise.all([
      "Channel Divinity: Turn Undead",
      "Channel Divinity: Preserve Life",
      "Channel Divinity: Sacred Weapon",
      "Channel Divinity: Cloak of Shadows",
      "Channel Divinity: Vow of Enmity",
      "Channel Divinity: Abjure Enemy",
    ].map(loadOption));
  });

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  it("Cleric L2 Turn Undead spends the CD pool, surfaces the DC, logs a history event", async () => {
    await createCharacter(XP_L2, "cleric", null);
    const res = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Turn Undead"] }]);
    expect(res.status).toBe(200);
    expect(cdUsed(res.body)).toBe(1);

    const events = await activity();
    const cd = events.find((e) => e.type === "castChannelDivinity")!;
    expect(cd).toBeDefined();
    // Wisdom-based DC: 8 + prof(2) + wisMod(+3) = 13.
    expect(cd.data).toMatchObject({ abilityName: "Channel Divinity: Turn Undead", saveDc: 13, kind: "announce" });
    expect(cd.summary).toMatch(/DC 13/);
    expect(events.some((e) => e.type === "spendResource")).toBe(true);
  });

  it("Paladin Devotion Sacred Weapon applies a real attackRoll buff (max(1,Cha) = +3) and revert clears it", async () => {
    await createCharacter(XP_L3, "paladin", "oath of devotion");
    const res = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Sacred Weapon"] }]);
    expect(res.status).toBe(200);

    const withBuff = await prisma.character.findUnique({ where: { id: FIXTURE_ID }, select: { activeEffects: true } });
    const buffs = (withBuff!.activeEffects as { buffs: { target: string; modifier: number; duration: string }[] }).buffs;
    expect(buffs).toContainEqual(expect.objectContaining({ target: "attackRoll", modifier: 3, duration: "while-active" }));

    // Undo the batch → CD refunded + buff cleared (create/cleanup symmetry).
    const batchId = (await activity()).find((e) => e.type === "castChannelDivinity")!.batchId!;
    const undo = await agent().post(`/api/characters/${FIXTURE_ID}/events/${batchId}/revert`);
    expect(undo.status).toBe(200);
    expect(cdUsed(undo.body)).toBe(0);
    const cleared = await prisma.character.findUnique({ where: { id: FIXTURE_ID }, select: { activeEffects: true } });
    expect((cleared!.activeEffects as { buffs: unknown[] }).buffs.length).toBe(0);
  });

  it("Trickery Cloak of Shadows (L6) self-applies the invisible condition", async () => {
    await createCharacter(XP_L6, "cleric", "trickery domain");
    const res = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Cloak of Shadows"] }]);
    expect(res.status).toBe(200);
    const row = await prisma.character.findUnique({ where: { id: FIXTURE_ID }, select: { conditions: true } });
    const active = (row!.conditions as { active: { key: string }[] }).active;
    expect(active.some((c) => c.key === "invisible")).toBe(true);
  });

  it("Vengeance Vow of Enmity records advantage roll-mode in the event data", async () => {
    await createCharacter(XP_L3, "paladin", "oath of vengeance");
    const res = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Vow of Enmity"] }]);
    expect(res.status).toBe(200);
    const cd = (await activity()).find((e) => e.type === "castChannelDivinity")!;
    expect(cd.data).toMatchObject({ kind: "advantage", rollMode: "advantage" });
    expect(cd.data!.reminder).toMatch(/advantage/i);
  });

  it("Life Domain Preserve Life carries the derived HP pool (5× level) in its reminder", async () => {
    await createCharacter(XP_L2, "cleric", "life domain");
    const res = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Preserve Life"] }]);
    expect(res.status).toBe(200);
    const cd = (await activity()).find((e) => e.type === "castChannelDivinity")!;
    // Level 2 → 10 HP pool.
    expect(cd.data!.reminder).toMatch(/10 HP/);
  });

  // ── Gating (the non-happy paths) ────────────────────────────────────────────

  it("rejects a domain option the cleric's subclass doesn't grant", async () => {
    await createCharacter(XP_L2, "cleric", "trickery domain");
    const res = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Preserve Life"] }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/life domain/i);
  });

  it("rejects an oath option below the granting level (Cloak of Shadows needs L6)", async () => {
    await createCharacter(XP_L2, "cleric", "trickery domain");
    const res = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Cloak of Shadows"] }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/level 6/);
  });

  it("rejects Turn Undead from a non-cleric", async () => {
    await createCharacter(XP_L6, "paladin", "oath of vengeance");
    const res = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Turn Undead"] }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cleric/i);
  });

  // ── GET picker ──────────────────────────────────────────────────────────────

  it("GET /channel-divinity returns only the entitled options with DCs", async () => {
    await createCharacter(XP_L3, "paladin", "oath of vengeance");
    const res = await agent().get(`/api/characters/${FIXTURE_ID}/channel-divinity`);
    expect(res.status).toBe(200);
    const names = (res.body as { name: string }[]).map((o) => o.name);
    expect(names).toContain("Channel Divinity: Abjure Enemy");
    expect(names).toContain("Channel Divinity: Vow of Enmity");
    expect(names).not.toContain("Channel Divinity: Turn Undead"); // cleric-only
    expect(names).not.toContain("Channel Divinity: Sacred Weapon"); // devotion-only
    const abjure = (res.body as { name: string; saveDc: number | null; kind: string }[]).find(
      (o) => o.name === "Channel Divinity: Abjure Enemy",
    )!;
    // Charisma-based DC: 8 + prof(2) + chaMod(+3) = 13.
    expect(abjure).toMatchObject({ kind: "announce", saveDc: 13 });
  });

  it("rejects a castChannelDivinity against a non-channelDivinity id", async () => {
    await createCharacter(XP_L2, "cleric", null);
    const maneuver = await prisma.grantedAbility.findFirst({ where: { source: "maneuver" } });
    const res = await cast([{ type: "castChannelDivinity", abilityId: maneuver!.id }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not found in catalog/);
  });
});
