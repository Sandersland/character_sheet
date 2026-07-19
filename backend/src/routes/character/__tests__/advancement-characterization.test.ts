/**
 * Characterization lock for the advancement transaction event stream (#682).
 *
 * The ~280-line applyOp in lib/leveling/advancement.ts is the sole emitter of
 * `advancement` audit events. Its `before` snapshot is what LIFO undo
 * (revertAdvancementEvent in lib/activity/activity.ts) restores wholesale, so
 * the payload shapes must stay byte-identical through the planned handler
 * decomposition. This oracle pins the EXACT emitted stream — event type,
 * category, summary, data, and full before/after — plus the exact
 * InvalidAdvancementOperationError message strings for the validation blocks
 * being deduplicated. It must be green now and stay green UNEDITED after the
 * refactor.
 *
 * The load-bearing risks it guards:
 *  - the 4-key before/after shape (abilityScores / hitPoints / initiativeBonus
 *    / resources) — since #818 resources is the canonical 6-key snapshotResources
 *    blob (incl. fightingStyle) so wholesale revert can't wipe it;
 *  - the AdvancementEntry field set written into resources.advancements
 *    (id/level/kind/abilityDeltas/hpDelta/initDelta + feat fields), which
 *    reverseAdvancementEffects and level reconciliation replay;
 *  - the near-duplicate catalog vs custom half-feat validation messages.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-adv-char";
let COOKIE: string;
const app = createApp();

const BASE_ABILITY = { strength: 10, dexterity: 13, constitution: 13, intelligence: 10, wisdom: 10, charisma: 10 };
const BASE = {
  alignment: "True Neutral",
  initiativeBonus: 1, // DEX 13 → +1
  speed: 30,
  abilityScores: BASE_ABILITY,
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

const CLASS_NAME = "Test Fighter (Adv Char Suite)";
const HALF_FEAT_NAME = "Test Resilient (Adv Char Suite)";
const PLAIN_FEAT_NAME = "Test Alert (Adv Char Suite)";
let fighterClassId: string;
let halfFeatId: string;
let plainFeatId: string;

async function postAdvancement(id: string, body: object) {
  return supertest(app).post(`/api/characters/${id}/advancement/transactions`).set("Cookie", COOKIE).send(body);
}
async function events(id: string) {
  return prisma.characterEvent.findMany({ where: { characterId: id }, orderBy: { createdAt: "asc" as const } });
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
  const fighter = await prisma.characterClass.upsert({
    where: { name: CLASS_NAME },
    create: { name: CLASS_NAME, hitDie: "d10", savingThrows: ["strength", "constitution"], skillChoiceCount: 2, skillChoices: ["athletics"], isSpellcaster: false, subclassLevel: 3 },
    update: {},
  });
  fighterClassId = fighter.id;

  // Half-feat: choosable +1 CON or WIS (Resilient-style), no improvements.
  const halfFeat = await prisma.feat.upsert({
    where: { name: HALF_FEAT_NAME },
    create: {
      name: HALF_FEAT_NAME,
      description: "You gain +1 to a chosen ability.",
      abilityOptions: ["constitution", "wisdom"],
      abilityIncrease: 1,
    },
    update: {},
  });
  halfFeatId = halfFeat.id;

  // Plain feat (no ability bump) with a structured improvement to pin the
  // improvements snapshot inside the AdvancementEntry.
  const plainFeat = await prisma.feat.upsert({
    where: { name: PLAIN_FEAT_NAME },
    create: {
      name: PLAIN_FEAT_NAME,
      description: "You gain +5 to initiative rolls.",
      improvements: [{ target: "initiative", amount: 5 }] as unknown as Prisma.InputJsonValue,
    },
    update: {},
  });
  plainFeatId = plainFeat.id;
});
afterAll(async () => {
  await prisma.feat.deleteMany({ where: { name: { in: [HALF_FEAT_NAME, PLAIN_FEAT_NAME] } } });
  await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
});
afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "AdvChar" } } });
});

// Level-8 fighter (XP 34000) → 2 advancement slots on the base 4/8/12/16/19
// schedule (fixture class name is not "fighter", so no extra slots).
// 60/66 HP, 8 hit dice, CON 13 / DEX 13 (both one point below a modifier bump).
async function createPlain(id: string, overrides: Record<string, unknown> = {}) {
  return prisma.character.create({
    data: {
      ...BASE,
      ownerId: OWNER_ID,
      id,
      name: `AdvChar ${id}`,
      experiencePoints: 34000,
      hitPoints: { current: 60, max: 66, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 8, die: "d10", spent: 0 },
      spellcasting: Prisma.JsonNull,
      classEntries: { create: [{ name: CLASS_NAME, classId: fighterClassId, position: 0, level: 8 }] },
      ...overrides,
    },
  });
}

const EMPTY_RESOURCES = {
  used: {},
  maneuversKnown: [],
  disciplinesKnown: [],
  toolProficienciesKnown: [],
  choicesKnown: {},
  advancements: [],
};

describe("advancement transaction event-stream characterization (#682)", () => {
  it("takeAsi crossing CON and DEX modifier boundaries: exact payload", async () => {
    await createPlain("adv-asi");
    const res = await postAdvancement("adv-asi", {
      operations: [{ type: "takeAsi", increases: [{ ability: "constitution", amount: 1 }, { ability: "dexterity", amount: 1 }] }],
    });
    expect(res.status).toBe(200);

    const evs = await events("adv-asi");
    expect(evs).toHaveLength(1);
    const [ev] = evs;
    expect(ev.category).toBe("advancement");
    expect(ev.type).toBe("abilityScoreImprovement");
    expect(ev.summary).toBe("Ability Score Improvement: constitution +1, dexterity +1");

    const entryId = (ev.data as { entryId: string }).entryId;
    expect(entryId).toBeTruthy();
    // CON 13→14 (+1→+2 mod) → hpDelta = 1 × 8 hit dice; DEX 13→14 → initDelta 1.
    expect(ev.data).toEqual({
      entryId,
      abilityDeltas: { constitution: 1, dexterity: 1 },
      hpDelta: 8,
      initDelta: 1,
    });
    expect(ev.before).toEqual({
      abilityScores: BASE_ABILITY,
      hitPoints: { current: 60, max: 66, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      initiativeBonus: 1,
      resources: EMPTY_RESOURCES,
    });
    expect(ev.after).toEqual({
      abilityScores: { ...BASE_ABILITY, constitution: 14, dexterity: 14 },
      hitPoints: { current: 68, max: 74, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      initiativeBonus: 2,
      resources: {
        ...EMPTY_RESOURCES,
        advancements: [{
          id: entryId,
          level: 8,
          kind: "asi",
          abilityDeltas: { constitution: 1, dexterity: 1 },
          hpDelta: 8,
          initDelta: 1,
        }],
      },
    });
  });

  it("takeAsi +2 to one ability with no modifier side-effects: exact payload", async () => {
    await createPlain("adv-asi2");
    const res = await postAdvancement("adv-asi2", {
      operations: [{ type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] }],
    });
    expect(res.status).toBe(200);

    const evs = await events("adv-asi2");
    expect(evs).toHaveLength(1);
    const [ev] = evs;
    expect(ev.summary).toBe("Ability Score Improvement: strength +2");
    const entryId = (ev.data as { entryId: string }).entryId;
    expect(ev.data).toEqual({ entryId, abilityDeltas: { strength: 2 }, hpDelta: 0, initDelta: 0 });
    expect((ev.after as { abilityScores: Record<string, number> }).abilityScores.strength).toBe(12);
    expect((ev.after as { hitPoints: { max: number } }).hitPoints.max).toBe(66);
    expect((ev.after as { initiativeBonus: number }).initiativeBonus).toBe(1);
  });

  it("takeFeat catalog half-feat: exact payload incl. entry snapshot", async () => {
    await createPlain("adv-half");
    const res = await postAdvancement("adv-half", {
      operations: [{ type: "takeFeat", featId: halfFeatId, abilityChoice: "constitution" }],
    });
    expect(res.status).toBe(200);

    const evs = await events("adv-half");
    expect(evs).toHaveLength(1);
    const [ev] = evs;
    expect(ev.category).toBe("advancement");
    expect(ev.type).toBe("featTaken");
    expect(ev.summary).toBe(`Feat: ${HALF_FEAT_NAME} (+1 constitution)`);

    const entryId = (ev.data as { entryId: string }).entryId;
    expect(ev.data).toEqual({
      entryId,
      featName: HALF_FEAT_NAME,
      featId: halfFeatId,
      abilityDeltas: { constitution: 1 },
      hpDelta: 8,
      initDelta: 0,
    });
    expect(ev.before).toEqual({
      abilityScores: BASE_ABILITY,
      hitPoints: { current: 60, max: 66, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      initiativeBonus: 1,
      resources: EMPTY_RESOURCES,
    });
    expect(ev.after).toEqual({
      abilityScores: { ...BASE_ABILITY, constitution: 14 },
      hitPoints: { current: 68, max: 74, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      initiativeBonus: 1,
      resources: {
        ...EMPTY_RESOURCES,
        advancements: [{
          id: entryId,
          level: 8,
          kind: "feat",
          abilityDeltas: { constitution: 1 },
          hpDelta: 8,
          initDelta: 0,
          featId: halfFeatId,
          featName: HALF_FEAT_NAME,
          featDescription: "You gain +1 to a chosen ability.",
          improvements: [],
        }],
      },
    });
  });

  it("takeFeat catalog non-half-feat: no bump suffix, improvements snapshotted", async () => {
    await createPlain("adv-plain");
    const res = await postAdvancement("adv-plain", {
      operations: [{ type: "takeFeat", featId: plainFeatId }],
    });
    expect(res.status).toBe(200);

    const evs = await events("adv-plain");
    expect(evs).toHaveLength(1);
    const [ev] = evs;
    expect(ev.type).toBe("featTaken");
    expect(ev.summary).toBe(`Feat: ${PLAIN_FEAT_NAME}`);
    const entryId = (ev.data as { entryId: string }).entryId;
    expect(ev.data).toEqual({
      entryId,
      featName: PLAIN_FEAT_NAME,
      featId: plainFeatId,
      abilityDeltas: {},
      hpDelta: 0,
      initDelta: 0,
    });
    // The persisted column snapshot is untouched (improvements apply at read).
    expect((ev.after as { initiativeBonus: number }).initiativeBonus).toBe(1);
    expect((ev.after as { resources: { advancements: unknown[] } }).resources.advancements).toEqual([{
      id: entryId,
      level: 8,
      kind: "feat",
      abilityDeltas: {},
      hpDelta: 0,
      initDelta: 0,
      featId: plainFeatId,
      featName: PLAIN_FEAT_NAME,
      featDescription: "You gain +5 to initiative rolls.",
      improvements: [{ target: "initiative", amount: 5 }],
    }]);
  });

  it("takeFeat custom half-feat: featId null in data, no featId key on the entry", async () => {
    await createPlain("adv-custom");
    const res = await postAdvancement("adv-custom", {
      operations: [{
        type: "takeFeat",
        custom: {
          name: "Test Fey Touched",
          description: "Misty escape.",
          abilityOptions: ["wisdom", "charisma"],
          abilityIncrease: 1,
          improvements: [{ target: "speed", amount: 5 }],
        },
        abilityChoice: "wisdom",
      }],
    });
    expect(res.status).toBe(200);

    const evs = await events("adv-custom");
    expect(evs).toHaveLength(1);
    const [ev] = evs;
    expect(ev.type).toBe("featTaken");
    expect(ev.summary).toBe("Feat: Test Fey Touched (+1 wisdom)");
    const entryId = (ev.data as { entryId: string }).entryId;
    expect(ev.data).toEqual({
      entryId,
      featName: "Test Fey Touched",
      featId: null,
      abilityDeltas: { wisdom: 1 },
      hpDelta: 0,
      initDelta: 0,
    });
    const entry = (ev.after as { resources: { advancements: Record<string, unknown>[] } }).resources.advancements[0];
    expect(entry).toEqual({
      id: entryId,
      level: 8,
      kind: "feat",
      abilityDeltas: { wisdom: 1 },
      hpDelta: 0,
      initDelta: 0,
      featName: "Test Fey Touched",
      featDescription: "Misty escape.",
      improvements: [{ target: "speed", amount: 5 }],
    });
    expect(Object.keys(entry)).not.toContain("featId");
  });

  // The batch semantics the decomposition most endangers: per-op re-read means
  // op 2 sees op 1's results — the feat's CON 14→15 bump does NOT cross a
  // modifier boundary, so its hpDelta is 0 (unlike the standalone half-feat test).
  it("ASI + feat batch then remove both: shared batchId, exact removal payloads, LIFO clamp", async () => {
    await createPlain("adv-round");
    const takeRes = await postAdvancement("adv-round", {
      operations: [
        { type: "takeAsi", increases: [{ ability: "constitution", amount: 1 }, { ability: "dexterity", amount: 1 }] },
        { type: "takeFeat", featId: halfFeatId, abilityChoice: "constitution" },
      ],
    });
    expect(takeRes.status).toBe(200);

    const takeEvs = await events("adv-round");
    expect(takeEvs.map((e) => e.type)).toEqual(["abilityScoreImprovement", "featTaken"]);
    expect(takeEvs[0].batchId).toBe(takeEvs[1].batchId);
    expect(takeEvs[0].batchId).toBeTruthy();
    expect(takeEvs[1].data).toEqual({
      entryId: (takeEvs[1].data as { entryId: string }).entryId,
      featName: HALF_FEAT_NAME,
      featId: halfFeatId,
      abilityDeltas: { constitution: 1 },
      hpDelta: 0,
      initDelta: 0,
    });
    // Op 2's before is op 1's after.
    expect(takeEvs[1].before).toEqual(takeEvs[0].after);

    const advancements: { id: string; kind: string }[] = takeRes.body.advancements;
    const asiEntryId = advancements.find((a) => a.kind === "asi")!.id;
    const featEntryId = advancements.find((a) => a.kind === "feat")!.id;

    const removeRes = await postAdvancement("adv-round", {
      operations: [
        { type: "removeAdvancement", entryId: featEntryId },
        { type: "removeAdvancement", entryId: asiEntryId },
      ],
    });
    expect(removeRes.status).toBe(200);

    const evs = await events("adv-round");
    expect(evs.map((e) => e.type)).toEqual([
      "abilityScoreImprovement", "featTaken", "advancementRemoved", "advancementRemoved",
    ]);
    const [, , removeFeat, removeAsi] = evs;
    expect(removeFeat.summary).toBe(`Removed advancement: Feat: ${HALF_FEAT_NAME}`);
    expect(removeFeat.data).toEqual({ entryId: featEntryId, label: `Feat: ${HALF_FEAT_NAME}` });
    // Key order comes from the jsonb round-trip (shorter keys first), not the
    // op's increases order — pinned as observed.
    expect(removeAsi.summary).toBe("Removed advancement: ASI: dexterity +1, constitution +1");
    expect(removeAsi.data).toEqual({ entryId: asiEntryId, label: "ASI: dexterity +1, constitution +1" });

    // Final state: scores/init restored; HP max restored but current clamped to
    // the restored max (reverseAdvancementEffects clamps, it does not subtract).
    expect(removeAsi.after).toEqual({
      abilityScores: BASE_ABILITY,
      hitPoints: { current: 66, max: 66, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      initiativeBonus: 1,
      resources: EMPTY_RESOURCES,
    });
  });

  // ── Error-message parity (exact strings, esp. the duplicated half-feat blocks) ──

  async function expect400(id: string, op: object, message: string) {
    const res = await postAdvancement(id, { operations: [op] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: message });
  }

  it("pins the slot-exhausted and takeAsi validation messages", async () => {
    // Level 1 (XP 0) → 0 slots.
    await createPlain("adv-err-slots", { experiencePoints: 0, classEntries: { create: [{ name: CLASS_NAME, classId: fighterClassId, position: 0, level: 1 }] } });
    await expect400("adv-err-slots",
      { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
      "No advancement slots available (0/0 used)");

    await createPlain("adv-err-asi", { abilityScores: { ...BASE_ABILITY, strength: 19 } });
    await expect400("adv-err-asi",
      { type: "takeAsi", increases: [{ ability: "strength", amount: 1 }] },
      "takeAsi: increases must sum to exactly 2 (got 1)");
    await expect400("adv-err-asi",
      { type: "takeAsi", increases: [{ ability: "luck", amount: 2 }] },
      'takeAsi: unknown ability "luck"');
    await expect400("adv-err-asi",
      { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
      "takeAsi: strength would exceed 20 (current 19, +2)");

    // Failed ops roll back without logging anything.
    expect(await events("adv-err-asi")).toHaveLength(0);
  });

  it("pins the catalog half-feat validation messages", async () => {
    await createPlain("adv-err-cat", { abilityScores: { ...BASE_ABILITY, wisdom: 20 } });
    await expect400("adv-err-cat",
      { type: "takeFeat", featId: halfFeatId },
      `takeFeat: "${HALF_FEAT_NAME}" is a half-feat — provide abilityChoice from: constitution, wisdom`);
    await expect400("adv-err-cat",
      { type: "takeFeat", featId: halfFeatId, abilityChoice: "strength" },
      `takeFeat: "strength" is not a valid choice for "${HALF_FEAT_NAME}" (options: constitution, wisdom)`);
    await expect400("adv-err-cat",
      { type: "takeFeat", featId: halfFeatId, abilityChoice: "wisdom" },
      "takeFeat: wisdom would exceed 20 with +1");
    await expect400("adv-err-cat",
      { type: "takeFeat", featId: "nonexistent-feat-id" },
      "Feat not found in catalog: nonexistent-feat-id");
  });

  it("pins the custom half-feat validation messages (distinct missing-choice wording)", async () => {
    await createPlain("adv-err-cust", { abilityScores: { ...BASE_ABILITY, charisma: 19 } });
    const custom = {
      name: "Test Fey Touched",
      description: "Misty escape.",
      abilityOptions: ["wisdom", "charisma"],
      abilityIncrease: 2,
    };
    await expect400("adv-err-cust",
      { type: "takeFeat", custom },
      'takeFeat: custom feat "Test Fey Touched" has abilityOptions — provide abilityChoice from: wisdom, charisma');
    await expect400("adv-err-cust",
      { type: "takeFeat", custom, abilityChoice: "strength" },
      'takeFeat: "strength" is not a valid choice for "Test Fey Touched" (options: wisdom, charisma)');
    await expect400("adv-err-cust",
      { type: "takeFeat", custom, abilityChoice: "charisma" },
      "takeFeat: charisma would exceed 20 with +2");
  });

  it("pins the removeAdvancement not-found message", async () => {
    await createPlain("adv-err-rm");
    await expect400("adv-err-rm",
      { type: "removeAdvancement", entryId: "no-such-entry" },
      "Advancement entry not found: no-such-entry");
  });
});
