/**
 * Party-target healing (#462). Real Postgres, supertest against createApp().
 * Fixtures: a campaign owned by DM (who also plays a healer character) with
 * PLAYER joined; PLAYER owns TARGET (opted in) and TARGET_OPTOUT (not opted in),
 * both attached to the campaign. The healer casts Cure Wounds at an ally's sheet.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { ensureTestOwner } from "@/test-support/owner.js";

const DM = "pth-dm";
const PLAYER = "pth-player";
const HEALER = "test-pth-healer";
const TARGET = "test-pth-target";
const TARGET_OPTOUT = "test-pth-target-optout";
const LONER = "test-pth-loner"; // healer-owned char in no campaign

const app = createApp();
const agent = (cookie: string) => supertest.agent(app).set("Cookie", cookie);

const BASE_CHAR = {
  alignment: "Neutral Good",
  experiencePoints: 0,
  initiativeBonus: 1,
  speed: 30,
  hitDice: { total: 1, die: "d8" },
  abilityScores: {
    strength: 10, dexterity: 12, constitution: 12,
    intelligence: 10, wisdom: 16, charisma: 10,
  },
  savingThrowProficiencies: ["wisdom", "charisma"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

// Healer spellbook: a level-1 Cure Wounds (heal) so casts spend an L1 slot.
const HEALER_SPELLCASTING = {
  slotsUsed: {},
  spells: [
    {
      id: "pth-cure-wounds",
      name: "Cure Wounds",
      level: 1,
      school: "evocation",
      prepared: true,
      castingTime: "1 action",
      range: "Touch",
      duration: "Instantaneous",
      description: "Heal 1d8 + spellcasting modifier.",
      effectKind: "heal",
      effectDiceCount: 1,
      effectDiceFaces: 8,
    },
  ],
};

let cookieDm: string;
let cookiePlayer: string;
let campaignId: string;

async function healerCast(targetId: string, amount: number) {
  return agent(cookieDm)
    .post(`/api/characters/${HEALER}/spellcasting/transactions`)
    .send({
      operations: [
        {
          type: "castSpell",
          entryId: "pth-cure-wounds",
          slotLevel: 1,
          roll: amount,
          apply: { target: { characterId: targetId }, kind: "heal", amount },
        },
      ],
    });
}

describe("party-target healing (#462)", () => {
  beforeAll(async () => {
    await ensureTestOwner(DM);
    await ensureTestOwner(PLAYER);
    cookieDm = await authCookie(DM);
    cookiePlayer = await authCookie(PLAYER);

    const cls = await prisma.characterClass.upsert({
      where: { name: "PTH Cleric" },
      create: {
        name: "PTH Cleric", hitDie: "d8", savingThrows: ["wisdom", "charisma"],
        skillChoiceCount: 2, skillChoices: ["insight", "religion"], isSpellcaster: true,
      },
      update: {},
    });

    await prisma.character.create({
      data: {
        ...BASE_CHAR, id: HEALER, name: "Keyleth", ownerId: DM,
        hitPoints: { current: 10, max: 10, temp: 0 },
        spellcasting: HEALER_SPELLCASTING as Prisma.InputJsonValue,
        classEntries: { create: [{ name: "cleric", classId: cls.id, position: 0 }] },
      },
    });
    await prisma.character.create({
      data: {
        ...BASE_CHAR, id: TARGET, name: "Grog", ownerId: PLAYER,
        hitPoints: { current: 3, max: 20, temp: 0 }, spellcasting: Prisma.JsonNull,
      },
    });
    await prisma.character.create({
      data: {
        ...BASE_CHAR, id: TARGET_OPTOUT, name: "Vax", ownerId: PLAYER,
        hitPoints: { current: 3, max: 20, temp: 0 }, spellcasting: Prisma.JsonNull,
      },
    });
    await prisma.character.create({
      data: {
        ...BASE_CHAR, id: LONER, name: "Solo", ownerId: DM,
        hitPoints: { current: 3, max: 20, temp: 0 }, spellcasting: Prisma.JsonNull,
      },
    });

    const created = await agent(cookieDm).post("/api/campaigns").send({ name: "Vox" });
    campaignId = created.body.id;
    await agent(cookieDm).post(`/api/campaigns/${campaignId}/characters`).send({ characterId: HEALER });
    await agent(cookiePlayer).post("/api/campaigns/join").send({ inviteCode: created.body.inviteCode });
    await agent(cookiePlayer).post(`/api/campaigns/${campaignId}/characters`).send({ characterId: TARGET });
    await agent(cookiePlayer).post(`/api/campaigns/${campaignId}/characters`).send({ characterId: TARGET_OPTOUT });

    // Target opts in; opt-out target leaves the default (false).
    await agent(cookiePlayer)
      .patch(`/api/characters/${TARGET}/campaign-preferences`)
      .send({ autoFriendlyHealing: true });
  });

  afterAll(async () => {
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.character.deleteMany({ where: { id: { in: [HEALER, TARGET, TARGET_OPTOUT, LONER] } } });
    await prisma.characterClass.deleteMany({ where: { name: "PTH Cleric" } });
    await prisma.user.deleteMany({ where: { id: { in: [DM, PLAYER] } } });
  });

  beforeEach(async () => {
    // Reset mutable HP + slot state between cases.
    await prisma.character.update({
      where: { id: HEALER },
      data: { hitPoints: { current: 10, max: 10, temp: 0 }, spellcasting: HEALER_SPELLCASTING as Prisma.InputJsonValue },
    });
    await prisma.character.update({ where: { id: TARGET }, data: { hitPoints: { current: 3, max: 20, temp: 0 } } });
    await prisma.character.update({ where: { id: TARGET_OPTOUT }, data: { hitPoints: { current: 3, max: 20, temp: 0 } } });
    await prisma.characterEvent.deleteMany({ where: { characterId: { in: [TARGET, TARGET_OPTOUT] } } });
  });

  it("heals a consenting ally's sheet and audits the heal on the TARGET (actor player, source = caster)", async () => {
    const res = await healerCast(TARGET, 5);
    expect(res.status).toBe(200);

    // Caster's own HP is untouched; the slot was still spent.
    expect(res.body.hitPoints.current).toBe(10);
    const slot1 = res.body.spellcasting.slots.find((s: { level: number }) => s.level === 1);
    expect(slot1.used).toBe(1);

    // Target's HP updated (3 → 8).
    const target = await prisma.character.findUniqueOrThrow({ where: { id: TARGET } });
    expect((target.hitPoints as { current: number }).current).toBe(8);

    // Undoable audit event on the TARGET: category hitPoints, actor player,
    // source = caster name, with before/after snapshots.
    const heals = await prisma.characterEvent.findMany({
      where: { characterId: TARGET, type: "heal" },
    });
    expect(heals).toHaveLength(1);
    expect(heals[0].actor).toBe("player");
    expect(heals[0].category).toBe("hitPoints");
    expect(heals[0].summary).toBe("Keyleth healed 5 HP (3 → 8 HP)");
    expect(heals[0].data).toMatchObject({ amount: 5, source: "Keyleth" });
    expect((heals[0].before as { hitPoints: { current: number } }).hitPoints.current).toBe(3);
    expect((heals[0].after as { hitPoints: { current: number } }).hitPoints.current).toBe(8);
  });

  it("rejects a heal to an ally who has NOT opted in, leaving both sheets unchanged", async () => {
    const res = await healerCast(TARGET_OPTOUT, 5);
    expect(res.status).toBe(403);

    const target = await prisma.character.findUniqueOrThrow({ where: { id: TARGET_OPTOUT } });
    expect((target.hitPoints as { current: number }).current).toBe(3); // unchanged

    // The whole batch rolled back — the caster's slot is not spent.
    const healer = await prisma.character.findUniqueOrThrow({ where: { id: HEALER } });
    expect((healer.spellcasting as { slotsUsed: Record<string, number> }).slotsUsed["1"] ?? 0).toBe(0);

    const heals = await prisma.characterEvent.findMany({ where: { characterId: TARGET_OPTOUT, type: "heal" } });
    expect(heals).toHaveLength(0);
  });

  it("rejects a party target with a non-heal (damage) effect — healing only", async () => {
    const res = await agent(cookieDm)
      .post(`/api/characters/${HEALER}/spellcasting/transactions`)
      .send({
        operations: [{
          type: "castSpell", entryId: "pth-cure-wounds", slotLevel: 1, roll: 5,
          apply: { target: { characterId: TARGET }, kind: "damage", amount: 5 },
        }],
      });
    expect(res.status).toBe(403);
    const target = await prisma.character.findUniqueOrThrow({ where: { id: TARGET } });
    expect((target.hitPoints as { current: number }).current).toBe(3);
  });

  it("rejects a heal to a character outside the caster's campaign", async () => {
    const res = await healerCast(LONER, 5);
    expect(res.status).toBe(403);
    const loner = await prisma.character.findUniqueOrThrow({ where: { id: LONER } });
    expect((loner.hitPoints as { current: number }).current).toBe(3);
  });

  it("leaves the self-heal path unchanged (heals the caster, no cross-sheet event)", async () => {
    // Damage the caster first (10 → 6) via a self-damage cantrip-less op is
    // unavailable here, so set HP directly, then self-heal 3 (6 → 9).
    await prisma.character.update({ where: { id: HEALER }, data: { hitPoints: { current: 6, max: 10, temp: 0 } } });
    const res = await agent(cookieDm)
      .post(`/api/characters/${HEALER}/spellcasting/transactions`)
      .send({
        operations: [{
          type: "castSpell", entryId: "pth-cure-wounds", slotLevel: 1, roll: 3,
          apply: { target: "self", kind: "heal", amount: 3 },
        }],
      });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(9); // caster healed

    // No heal event landed on any ally.
    const targetHeals = await prisma.characterEvent.findMany({ where: { characterId: TARGET, type: "heal" } });
    expect(targetHeals).toHaveLength(0);
  });
});
