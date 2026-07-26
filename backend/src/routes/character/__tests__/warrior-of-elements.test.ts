/**
 * Warrior of the Elements route tests (#1247). A level-17 Warrior of the
 * Elements (Wis 16, prof +6) has focus DC 17 and a d12 Martial Arts die.
 * Elemental Attunement toggles a 10-min while-active buff (spends 1 Focus);
 * Elemental Burst spends 2 Focus and rolls 3× the Martial Arts die vs a Dex
 * save; Elemental Strikes require an active attunement and force a Str save.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/core/prisma.js";
import { ELEMENTAL_ATTUNEMENT_BUFF_KEY } from "@/lib/classes/warrior-of-elements.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { readPinnedEvents } from "@/test-support/events.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-warrior-of-elements";
let COOKIE: string;
const FIXTURE_ID = "test-warrior-of-elements-1";
const CLASS_NAME = "Warrior of Elements Route Test Monk";

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Warrior of Elements Test Monk",
  alignment: "True Neutral",
  experiencePoints: 225000, // level 17 → proficiency +6, Martial Arts die d12
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 120, max: 120, temp: 0 },
  hitDice: { total: 17, die: "d8" },
  abilityScores: { strength: 10, dexterity: 18, constitution: 14, intelligence: 10, wisdom: 16, charisma: 10 },
  savingThrowProficiencies: ["strength", "dexterity"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

function agent() {
  return supertest.agent(createApp()).set("Cookie", COOKIE);
}
const url = `/api/characters/${FIXTURE_ID}/abilities/warrior-of-elements/transactions`;

async function createMonk(level: number, subclass?: string) {
  const cls = await prisma.characterClass.upsert({
    where: { name: CLASS_NAME },
    create: { name: CLASS_NAME, hitDie: "d8", savingThrows: ["strength", "dexterity"], skillChoiceCount: 2, skillChoices: ["acrobatics"], isSpellcaster: false },
    update: {},
  });
  await prisma.character.create({
    data: {
      ...FIXTURE_BASE,
      experiencePoints: xpForLevel(level),
      ownerId: OWNER_ID,
      classEntries: { create: [{ name: "monk", classId: cls.id, position: 0, level, subclass }] },
    },
  });
}

// Minimal XP thresholds (levelForExperience) for the levels this suite uses.
function xpForLevel(level: number): number {
  if (level >= 17) return 225000;
  if (level >= 6) return 14000;
  if (level >= 3) return 900;
  return 0;
}

// A single-class monk whose classEntries[0].level COLUMN lags the XP-derived
// level (a "pending level-up" — the character gained XP but hasn't run the
// /hp levelUp op yet, mirrors hitDice.total vs progress.level in
// character-serialize.ts). Distinct from createMonk, which keeps both in sync.
async function createMonkStaleLevelColumn(entryLevelColumn: number, xpLevel: number, subclass?: string) {
  const cls = await prisma.characterClass.upsert({
    where: { name: CLASS_NAME },
    create: { name: CLASS_NAME, hitDie: "d8", savingThrows: ["strength", "dexterity"], skillChoiceCount: 2, skillChoices: ["acrobatics"], isSpellcaster: false },
    update: {},
  });
  await prisma.character.create({
    data: {
      ...FIXTURE_BASE,
      experiencePoints: xpForLevel(xpLevel),
      ownerId: OWNER_ID,
      classEntries: { create: [{ name: "monk", classId: cls.id, position: 0, level: entryLevelColumn, subclass }] },
    },
  });
}

async function activeBuffs(): Promise<{ key: string; duration?: string }[]> {
  const row = await prisma.character.findUnique({ where: { id: FIXTURE_ID }, select: { activeEffects: true } });
  return (row!.activeEffects as { buffs: { key: string; duration?: string }[] }).buffs;
}

describe("POST /api/characters/:id/abilities/warrior-of-elements/transactions", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  it("a level-17 Warrior of the Elements derives all four fixed features + gated actions (#1315)", async () => {
    await createMonk(17, "Warrior of the Elements");
    const res = await agent().get(`/api/characters/${FIXTURE_ID}`);
    expect(res.status).toBe(200);
    const featureNames = (res.body.resources.features as { name: string }[]).map((f) => f.name);
    for (const feature of [
      "Manipulate Elements",
      "Elemental Attunement",
      "Elemental Burst",
      "Stride of the Elements",
      "Elemental Epitome",
    ]) {
      expect(featureNames).toContain(feature);
    }
    const actionKeys = (res.body.availableActions as { key: string }[]).map((a) => a.key);
    expect(actionKeys).toContain("elementalAttunement");
    expect(actionKeys).toContain("elementalBurst");
  });

  it("Elemental Attunement toggles a 10-min while-active buff, spending 1 Focus", async () => {
    await createMonk(17, "Warrior of the Elements");
    const res = await agent().post(url).send({ operations: [{ type: "toggleElementalAttunement", active: true }] });
    expect(res.status).toBe(200);
    expect(res.body.results[0].active).toBe(true);

    const focus = res.body.character.resources.pools.find((p: { key: string }) => p.key === "focus");
    expect(focus.remaining).toBe(16); // 17 total − 1 spent

    const buffs = await activeBuffs();
    const buff = buffs.find((b) => b.key === ELEMENTAL_ATTUNEMENT_BUFF_KEY)!;
    expect(buff).toBeDefined();
    expect(buff.duration).toBe("while-active");

    // Toggling off clears the buff (no Focus refund).
    const off = await agent().post(url).send({ operations: [{ type: "toggleElementalAttunement", active: false }] });
    expect(off.status).toBe(200);
    expect(off.body.results[0].active).toBe(false);
    expect((await activeBuffs()).some((b) => b.key === ELEMENTAL_ATTUNEMENT_BUFF_KEY)).toBe(false);
  });

  // #1275 byte-identity oracle: captured on the per-feature URL before the move to
  // the shared ability endpoint, so a green run afterwards is evidence the audit
  // trail is unchanged.
  it("pins the audit trail of one Elemental Attunement toggle", async () => {
    await createMonk(17, "Warrior of the Elements");
    const res = await agent().post(url).send({ operations: [{ type: "toggleElementalAttunement", active: true }] });
    expect(res.status).toBe(200);

    const noResourcesUsed = {
      resources: { used: {}, maneuversKnown: [], toolProficienciesKnown: [], choicesKnown: {}, advancements: [] },
    };
    const buff = {
      id: expect.any(String), key: ELEMENTAL_ATTUNEMENT_BUFF_KEY, source: "Elemental Attunement",
      target: "elementalAttunement", modifier: 0, duration: "while-active",
    };

    expect(await readPinnedEvents(FIXTURE_ID)).toEqual([
      {
        category: "effects",
        type: "buffApplied",
        summary: "Elemental Attunement: +0 to elementalAttunement",
        before: { activeEffects: { buffs: [] } },
        after: { activeEffects: { buffs: [buff] } },
        data: { key: "elementalAttunement", target: "elementalAttunement", modifier: 0, sourceEntryId: null },
      },
      {
        category: "resources",
        type: "spendResource",
        summary: "Spent 1 Focus Points — 16/17 remaining",
        before: noResourcesUsed,
        after: { resources: { ...noResourcesUsed.resources, used: { focus: 1 } } },
        data: { key: "focus", amount: 1, remaining: 16, roll: null },
      },
      {
        category: "resources",
        type: "toggleElementalAttunement",
        summary: "Elemental Attunement — imbued with elemental energy for 10 minutes (or until Incapacitated).",
        before: null,
        after: null,
        data: { active: true },
      },
    ]);
  });

  it("cannot activate Elemental Attunement twice", async () => {
    await createMonk(17, "Warrior of the Elements");
    await agent().post(url).send({ operations: [{ type: "toggleElementalAttunement", active: true }] });
    const res = await agent().post(url).send({ operations: [{ type: "toggleElementalAttunement", active: true }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already active/i);
  });

  it("Elemental Burst spends 2 Focus and resolves a Dex save vs the focus DC (17)", async () => {
    await createMonk(17, "Warrior of the Elements");
    // Client rolls three d12s and sends the total (max 36); server halves on a made save.
    const res = await agent().post(url).send({ operations: [{ type: "castElementalBurst", damageType: "fire", roll: 30 }] });
    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.dc).toBe(17);
    expect(result.damageType).toBe("fire");
    expect(["fail", "success"]).toContain(result.outcome);
    expect(result.appliedDamage).toBe(result.outcome === "success" ? 15 : 30);

    const focus = res.body.character.resources.pools.find((p: { key: string }) => p.key === "focus");
    expect(focus.remaining).toBe(15); // 17 total − 2 spent
  });

  it("Elemental Burst is rejected below level 6", async () => {
    await createMonk(3, "Warrior of the Elements");
    const res = await agent().post(url).send({ operations: [{ type: "castElementalBurst", damageType: "cold", roll: 6 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/level 6/i);
  });

  it("Elemental Strikes require an active attunement, then force a Str save to move the target", async () => {
    await createMonk(17, "Warrior of the Elements");
    // No attunement yet → rejected.
    const blocked = await agent().post(url).send({ operations: [{ type: "elementalStrike", damageType: "lightning", roll: 8 }] });
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toMatch(/attunement/i);

    await agent().post(url).send({ operations: [{ type: "toggleElementalAttunement", active: true }] });
    const res = await agent().post(url).send({ operations: [{ type: "elementalStrike", damageType: "lightning", roll: 8 }] });
    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.dc).toBe(17);
    expect(result.damageType).toBe("lightning");
    expect(["fail", "success"]).toContain(result.outcome);
    expect(result.moved).toBe(result.outcome === "fail");

    // Elemental Strikes cost no Focus (only the attunement's 1 was spent).
    const focus = res.body.character.resources.pools.find((p: { key: string }) => p.key === "focus");
    expect(focus.remaining).toBe(16);
  });

  // #1315: assertWarriorOfElements now resolves through deriveEntryScopedActions
  // (the same shared function shadow-arts.ts's guards use) instead of comparing
  // XP-derived level against the classEntries[].level COLUMN directly. That
  // column can lag XP (a pending level-up not yet applied via /hp levelUp,
  // mirrored by progress.level vs hitDice.total in character-serialize.ts) — the
  // OLD hand-rolled check trusted the stale column and would reject a
  // genuinely-eligible L3 character; the new shared-function check resolves
  // against the XP-derived effective level for single-class characters instead.
  it("gates off the XP-derived level, not a stale classEntries[].level column (single-class pending level-up)", async () => {
    await createMonkStaleLevelColumn(2, 3, "Warrior of the Elements");
    const res = await agent().post(url).send({ operations: [{ type: "toggleElementalAttunement", active: true }] });
    expect(res.status).toBe(200);
  });

  it("rejects Elemental Attunement from a non-elements monk", async () => {
    await createMonk(17, "Warrior of the Open Hand");
    const res = await agent().post(url).send({ operations: [{ type: "toggleElementalAttunement", active: true }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Warrior of the Elements/i);
  });
});
