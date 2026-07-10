/**
 * Locks the exact `buffCleared` event payload (summary + data keys + before/after
 * snapshots) each clear* wrapper writes — the contract batch revert in activity.ts
 * depends on. Guards the clearBuffsMatchingInTx unification (#593). Requires
 * DATABASE_URL (docker compose up db).
 */

import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import {
  clearBuffByKeyInTx,
  clearBuffsByTargetInTx,
  clearBuffsForRestInTx,
  clearBuffsForSourceInTx,
  clearWhileActiveBuffsInTx,
  normalizeActiveEffectsMutable,
  serializeActiveEffectsState,
  type ActiveBuff,
} from "@/lib/active-effects.js";

const OWNER_ID = "owner-clear-events";
const FIXTURE_ID = "test-clear-events-character-1";

async function seedBuffs(buffs: ActiveBuff[]) {
  await prisma.character.update({
    where: { id: FIXTURE_ID },
    data: { activeEffects: serializeActiveEffectsState({ buffs }) },
  });
}

async function lastClearEvent() {
  return prisma.characterEvent.findFirstOrThrow({
    where: { characterId: FIXTURE_ID, type: "buffCleared" },
    orderBy: { createdAt: "desc" },
  });
}

async function readKeys() {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: FIXTURE_ID }, select: { activeEffects: true } });
  return normalizeActiveEffectsMutable(row.activeEffects).buffs.map((b) => b.key);
}

const conc = (key: string, target: string, sourceEntryId: string): ActiveBuff => ({
  id: randomUUID(), key, target, modifier: 1, source: key, sourceEntryId, duration: "concentration",
});
const durable = (key: string, target: string, duration: "while-active" | "until-rest", restType?: "short" | "long"): ActiveBuff => ({
  id: randomUUID(), key, target, modifier: 2, source: key, duration, ...(restType ? { restType } : {}),
});

describe("clear* wrappers — buffCleared event payloads (#593)", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    await prisma.character.create({
      data: {
        id: FIXTURE_ID,
        name: "Clear Events Char",
        alignment: "Neutral",
        ownerId: OWNER_ID,
        experiencePoints: 0,
        initiativeBonus: 0,
        speed: 30,
        hitPoints: { current: 10, max: 10, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 1, die: "d8", spent: 0 },
        abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
        savingThrowProficiencies: [],
        skills: [],
        toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      },
    });
  });

  afterEach(async () => {
    await prisma.characterEvent.deleteMany({ where: { characterId: FIXTURE_ID } });
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  it("clearBuffsForSourceInTx: count summary + { sourceEntryId, reason, clearedKeys } data", async () => {
    await seedBuffs([conc("bless", "athletics", "e1"), conc("guidance", "arcana", "e1"), durable("rage", "meleeDamage", "while-active")]);
    const batchId = randomUUID();
    await prisma.$transaction((tx) => clearBuffsForSourceInTx(tx, FIXTURE_ID, "e1", batchId, null, "damage"));

    const ev = await lastClearEvent();
    expect(ev.category).toBe("effects");
    expect(ev.batchId).toBe(batchId);
    expect(ev.summary).toBe("Cleared 2 buffs (damage)");
    expect(ev.data).toEqual({ sourceEntryId: "e1", reason: "damage", clearedKeys: ["bless", "guidance"] });
    expect((ev.before as { activeEffects: { buffs: unknown[] } }).activeEffects.buffs).toHaveLength(3);
    expect((ev.after as { activeEffects: { buffs: unknown[] } }).activeEffects.buffs).toHaveLength(1);
    expect(await readKeys()).toEqual(["rage"]); // durable Rage survives
  });

  it("clearBuffsForSourceInTx: no-op + no event when nothing matches", async () => {
    await seedBuffs([durable("rage", "meleeDamage", "while-active")]);
    await prisma.$transaction((tx) => clearBuffsForSourceInTx(tx, FIXTURE_ID, "nope", randomUUID(), null, "damage"));
    expect(await prisma.characterEvent.count({ where: { characterId: FIXTURE_ID, type: "buffCleared" } })).toBe(0);
    expect(await readKeys()).toEqual(["rage"]);
  });

  it("clearBuffByKeyInTx: source summary + { key, reason, clearedKeys } data; leaves concentration alone", async () => {
    await seedBuffs([durable("rage", "meleeDamage", "while-active"), conc("rage", "athletics", "e1")]);
    await prisma.$transaction((tx) => clearBuffByKeyInTx(tx, FIXTURE_ID, "rage", randomUUID(), null, "endRage"));

    const ev = await lastClearEvent();
    expect(ev.summary).toBe("Cleared rage (endRage)");
    expect(ev.data).toEqual({ key: "rage", reason: "endRage", clearedKeys: ["rage"] });
    expect(await readKeys()).toEqual(["rage"]); // the concentration one survives
  });

  it("clearBuffsByTargetInTx: source summary + { target, reason, clearedKeys } data; leaves concentration alone", async () => {
    await seedBuffs([durable("mageArmor", "acUnarmoredBase", "while-active"), conc("shield", "acUnarmoredBase", "e2")]);
    await prisma.$transaction((tx) => clearBuffsByTargetInTx(tx, FIXTURE_ID, "acUnarmoredBase", randomUUID(), null, "donnedArmor"));

    const ev = await lastClearEvent();
    expect(ev.summary).toBe("Cleared mageArmor (donnedArmor)");
    expect(ev.data).toEqual({ target: "acUnarmoredBase", reason: "donnedArmor", clearedKeys: ["mageArmor"] });
    expect(await readKeys()).toEqual(["shield"]);
  });

  it("clearWhileActiveBuffsInTx: count summary + { reason, clearedKeys } data; only while-active", async () => {
    await seedBuffs([durable("rage", "meleeDamage", "while-active"), durable("bardic", "athletics", "until-rest", "short"), conc("bless", "arcana", "e1")]);
    await prisma.$transaction((tx) => clearWhileActiveBuffsInTx(tx, FIXTURE_ID, randomUUID(), null, "unconscious"));

    const ev = await lastClearEvent();
    expect(ev.summary).toBe("Cleared 1 buff (unconscious)");
    expect(ev.data).toEqual({ reason: "unconscious", clearedKeys: ["rage"] });
    expect((await readKeys()).sort()).toEqual(["bardic", "bless"]);
  });

  it("clearBuffsForRestInTx: rest summary + { restType, reason, clearedKeys } data; long clears short+long", async () => {
    await seedBuffs([durable("s", "athletics", "until-rest", "short"), durable("l", "athletics", "until-rest", "long"), conc("bless", "arcana", "e1")]);
    await prisma.$transaction((tx) => clearBuffsForRestInTx(tx, FIXTURE_ID, "long", randomUUID(), null));

    const ev = await lastClearEvent();
    expect(ev.summary).toBe("Cleared 2 buffs (long rest)");
    expect(ev.data).toEqual({ restType: "long", reason: "longRest", clearedKeys: ["s", "l"] });
    expect(await readKeys()).toEqual(["bless"]);
  });
});
