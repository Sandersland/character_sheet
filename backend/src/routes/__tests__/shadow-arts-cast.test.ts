/**
 * Shadow Arts cast endpoint (issue #441): POST /shadow-arts/transactions.
 * Real Postgres + supertest. Fixture is a Way of Shadow monk whose XP sets the
 * level. The 4 Shadow Arts spells are read from the seeded catalog by name.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { Prisma } from "../../generated/prisma/client.js";
import { shadowArtEffectSpec } from "../../lib/shadow-arts.js";
import { prisma } from "../../lib/prisma.js";
import { ensureTestOwner } from "../../test-support/owner.js";
import { authCookie } from "../../test-support/auth.js";

const OWNER_ID = "owner-shadow-cast";
let COOKIE: string;

const FIXTURE_ID = "test-shadow-cast-monk-1";
const CLASS_NAME = "Shadow Cast Test Monk";

// XP thresholds → monk level: L2=300, L3=900.
const XP_L2 = 300;
const XP_L3 = 900;

const url = `/api/characters/${FIXTURE_ID}/shadow-arts/transactions`;
const activityUrl = `/api/characters/${FIXTURE_ID}/activity?category=resources`;

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Shadow Cast Test Monk",
  alignment: "Neutral",
  initiativeBonus: 3,
  speed: 40,
  hitPoints: { current: 24, max: 24, temp: 0 },
  hitDice: { total: 3, die: "d8" },
  abilityScores: {
    strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 15, charisma: 10,
  },
  savingThrowProficiencies: ["strength", "dexterity"],
  skills: ["stealth"],
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
let darknessId: string;      // concentration, utility
let silenceId: string;       // concentration, utility
let passWithoutTraceId: string; // concentration, buff +10 stealth
let darkvisionId: string;    // no concentration, utility

async function createMonk(experiencePoints: number, subclass: string | null) {
  await prisma.character.create({
    data: {
      ...FIXTURE_BASE,
      experiencePoints,
      ownerId: OWNER_ID,
      resources: Prisma.JsonNull,
      classEntries: {
        create: [{ name: "monk", subclass, classId, position: 0 }],
      },
    },
  });
}

describe("Shadow Arts cast endpoint", () => {
  beforeAll(async () => {
    const cls = await prisma.characterClass.upsert({
      where: { name: CLASS_NAME },
      create: { name: CLASS_NAME, hitDie: "d8", savingThrows: ["strength", "dexterity"], skillChoiceCount: 2, skillChoices: ["acrobatics", "stealth"], isSpellcaster: false },
      update: {},
    });
    classId = cls.id;

    const [dk, sl, pwt, dv] = await Promise.all([
      prisma.grantedAbility.findUnique({ where: { name: "Shadow Arts: Darkness" } }),
      prisma.grantedAbility.findUnique({ where: { name: "Shadow Arts: Silence" } }),
      prisma.grantedAbility.findUnique({ where: { name: "Shadow Arts: Pass without Trace" } }),
      prisma.grantedAbility.findUnique({ where: { name: "Shadow Arts: Darkvision" } }),
    ]);
    darknessId = dk!.id;
    silenceId = sl!.id;
    passWithoutTraceId = pwt!.id;
    darkvisionId = dv!.id;
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

  it("casts each of the 4 Shadow Arts for 2 ki", async () => {
    for (const id of [darknessId, silenceId, passWithoutTraceId, darkvisionId]) {
      await createMonk(XP_L3, "way of shadow");
      const res = await cast([{ type: "castShadowArt", shadowArtId: id }]);
      expect(res.status).toBe(200);
      // The serialized character surfaces the Shadow Arts gate flag for the FE panel.
      expect(res.body.resources.shadowArtsAvailable).toBe(true);
      const ki = res.body.resources.pools.find((p: { key: string }) => p.key === "ki");
      expect(ki.used).toBe(2);

      const events = await activity();
      const castEvent = events.find((e) => e.type === "castShadowArt")!;
      expect(castEvent).toBeDefined();
      expect(castEvent.data).toMatchObject({ shadowArtId: id, kiSpent: 2 });
      expect(events.some((e) => e.type === "spendResource")).toBe(true);

      await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
    }
  });

  it("occupies the concentration slot for Darkness/Silence/Pass without Trace but not Darkvision", async () => {
    // Concentration Shadow Art → concentratingOn set.
    await createMonk(XP_L3, "way of shadow");
    const concRes = await cast([{ type: "castShadowArt", shadowArtId: darknessId }]);
    let row = await prisma.character.findUnique({ where: { id: FIXTURE_ID }, select: { spellcasting: true } });
    expect((row!.spellcasting as { concentratingOn: { entryId: string } | null }).concentratingOn)
      .toMatchObject({ entryId: darknessId, spellName: "Shadow Arts: Darkness" });
    // The serialized character must ALSO surface it — a Shadow Art's catalog-id
    // concentration entry isn't a spellbook spell, so the clamp must not drop it.
    expect(concRes.body.spellcasting.concentratingOn)
      .toMatchObject({ entryId: darknessId, spellName: "Shadow Arts: Darkness" });
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });

    // Non-concentration Shadow Art (Darkvision) never touches spellcasting — the
    // column stays null (no concentration established).
    await createMonk(XP_L3, "way of shadow");
    await cast([{ type: "castShadowArt", shadowArtId: darkvisionId }]);
    row = await prisma.character.findUnique({ where: { id: FIXTURE_ID }, select: { spellcasting: true } });
    const concentratingOn = (row!.spellcasting as { concentratingOn: unknown } | null)?.concentratingOn ?? null;
    expect(concentratingOn).toBeNull();
  });

  it("applies +10 Stealth buff for Pass without Trace and clears it on concentration break", async () => {
    await createMonk(XP_L3, "way of shadow");
    const res = await cast([{ type: "castShadowArt", shadowArtId: passWithoutTraceId }]);
    expect(res.status).toBe(200);

    // Buff applied via #438 engine.
    const withBuff = await prisma.character.findUnique({ where: { id: FIXTURE_ID }, select: { activeEffects: true } });
    const buffs = (withBuff!.activeEffects as { buffs: { target: string; modifier: number; sourceEntryId?: string }[] }).buffs;
    expect(buffs).toContainEqual(expect.objectContaining({ target: "stealth", modifier: 10, sourceEntryId: passWithoutTraceId }));

    // Break concentration → buff clears (create/cleanup symmetry).
    const drop = await agent()
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "dropConcentration", entryId: passWithoutTraceId }] });
    expect(drop.status).toBe(200);
    const cleared = await prisma.character.findUnique({ where: { id: FIXTURE_ID }, select: { activeEffects: true } });
    const remaining = (cleared!.activeEffects as { buffs: { sourceEntryId?: string }[] }).buffs;
    expect(remaining.some((b) => b.sourceEntryId === passWithoutTraceId)).toBe(false);
  });

  it("logs an undoable cast: revert refunds ki and restores concentration to null", async () => {
    await createMonk(XP_L3, "way of shadow");
    const casted = await cast([{ type: "castShadowArt", shadowArtId: passWithoutTraceId }]);
    expect(casted.body.resources.pools.find((p: { key: string }) => p.key === "ki").used).toBe(2);

    const events = await activity();
    const batchId = events.find((e) => e.type === "castShadowArt")!.batchId!;
    const undo = await agent().post(`/api/characters/${FIXTURE_ID}/events/${batchId}/revert`);
    expect(undo.status).toBe(200);
    expect(undo.body.resources.pools.find((p: { key: string }) => p.key === "ki").used).toBe(0);

    const reverted = await prisma.character.findUnique({ where: { id: FIXTURE_ID }, select: { spellcasting: true, activeEffects: true } });
    expect((reverted!.spellcasting as { concentratingOn: unknown }).concentratingOn).toBeNull();
    const buffs = (reverted!.activeEffects as { buffs: unknown[] }).buffs;
    expect(buffs.length).toBe(0);
  });

  it("rejects a Shadow Arts cast from a non-Shadow monk", async () => {
    await createMonk(XP_L3, "way of the four elements");
    const res = await cast([{ type: "castShadowArt", shadowArtId: darknessId }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Way of Shadow/i);
  });

  it("rejects a Shadow Arts cast from a sub-L3 Shadow monk", async () => {
    await createMonk(XP_L2, "way of shadow");
    const res = await cast([{ type: "castShadowArt", shadowArtId: darknessId }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/level 3/i);
  });
});

// Unit + source-guard coverage.
describe("shadowArtEffectSpec", () => {
  it("builds a flat non-scaling buff spec for Pass without Trace", () => {
    const spec = shadowArtEffectSpec({
      name: "Shadow Arts: Pass without Trace",
      effectKind: "buff",
      buffTarget: "stealth",
      buffModifier: 10,
    });
    expect(spec.effectType).toBe("buff");
    expect(spec.scaling).toEqual({ mode: "none" });
    expect(spec.concentration).toBe(true);
    expect(spec.buffTarget).toBe("stealth");
    expect(spec.buffModifier).toBe(10);
  });

  it("builds a roll-less utility spec with no concentration for Darkvision", () => {
    const spec = shadowArtEffectSpec({ name: "Shadow Arts: Darkvision" });
    expect(spec.effectType).toBe("utility");
    expect(spec.concentration).toBe(false);
    expect(spec.buffTarget).toBeNull();
  });
});

describe("Shadow Arts source guard", () => {
  const NON_SHADOW_NAME = "Test Non-Shadow GrantedAbility #441";
  const CLASS_NAME_2 = "Shadow Source Test Monk";
  const FIXTURE_ID_2 = "test-shadow-source-monk-1";
  let nonShadowId: string;
  let sourceClassId: string;

  beforeAll(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: CLASS_NAME_2 },
      create: { name: CLASS_NAME_2, hitDie: "d8", savingThrows: ["strength", "dexterity"], skillChoiceCount: 2, skillChoices: ["acrobatics", "stealth"], isSpellcaster: false },
      update: {},
    });
    sourceClassId = cls.id;
    const row = await prisma.grantedAbility.upsert({
      where: { name: NON_SHADOW_NAME },
      create: { name: NON_SHADOW_NAME, description: "A discipline, not a Shadow Art.", source: "discipline", minLevel: 3, costKind: "pool", costPoolKey: "ki", costBase: 2 },
      update: { source: "discipline" },
    });
    nonShadowId = row.id;
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID_2 } });
    await prisma.grantedAbility.deleteMany({ where: { name: NON_SHADOW_NAME } });
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME_2 } });
  });

  it("excludes non-shadowArts rows from GET /api/shadow-arts", async () => {
    const res = await agent().get("/api/shadow-arts");
    expect(res.status).toBe(200);
    expect((res.body as { id: string }[]).some((d) => d.id === nonShadowId)).toBe(false);
    expect((res.body as { name: string }[]).length).toBe(4);
  });

  it("rejects castShadowArt against a non-shadowArts id", async () => {
    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        id: FIXTURE_ID_2,
        experiencePoints: XP_L3,
        ownerId: OWNER_ID,
        resources: Prisma.JsonNull,
        classEntries: { create: [{ name: "monk", subclass: "way of shadow", classId: sourceClassId, position: 0 }] },
      },
    });
    const res = await agent()
      .post(`/api/characters/${FIXTURE_ID_2}/shadow-arts/transactions`)
      .send({ operations: [{ type: "castShadowArt", shadowArtId: nonShadowId }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not found in catalog/);
  });
});
