/**
 * Damage-type resistance auto-halve integration test (#456) — drives the real
 * applyHitPointOperations seam against Postgres. Requires DATABASE_URL
 * (docker compose up db).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../prisma.js";
import { ensureTestOwner } from "../../test-support/owner.js";
import { applyHitPointOperations, normalizeHitPoints, type DamageOperation } from "../hitpoints.js";

const OWNER_ID = "owner-hp-resistance";
const FIXTURE_ID = "test-hp-resistance-character-1";

async function seed(resistances: { damageType: string; source: string; sourceEntryId?: string }[]) {
  await prisma.character.create({
    data: {
      id: FIXTURE_ID,
      name: "Resistant Barbarian",
      alignment: "Neutral",
      ownerId: OWNER_ID,
      experiencePoints: 0,
      initiativeBonus: 0,
      speed: 30,
      hitPoints: { current: 30, max: 30, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 1, die: "d12", spent: 0 },
      abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 8, wisdom: 10, charisma: 8 },
      savingThrowProficiencies: [],
      skills: [],
      toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      activeEffects: { buffs: [], resistances: resistances.map((r, i) => ({ id: `r${i}`, ...r })) },
    },
  });
}

async function current(): Promise<number> {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: FIXTURE_ID }, select: { hitPoints: true } });
  return normalizeHitPoints(row.hitPoints).current;
}

async function lastDamageEvent() {
  return prisma.characterEvent.findFirst({
    where: { characterId: FIXTURE_ID, type: "damage" },
    orderBy: { createdAt: "desc" },
  });
}

async function damage(op: Omit<DamageOperation, "type">) {
  await applyHitPointOperations(FIXTURE_ID, [{ type: "damage", ...op }]);
}

describe("damage-taken flow: resistance auto-halve", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
  });

  afterEach(async () => {
    await prisma.characterEvent.deleteMany({ where: { characterId: FIXTURE_ID } });
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  it("halves 12 slashing to 6 when a slashing resistance is active, and records it in history", async () => {
    await seed([{ damageType: "slashing", source: "Rage", sourceEntryId: "rage-1" }]);
    await damage({ amount: 12, damageType: "slashing" });
    expect(await current()).toBe(24); // 30 - 6

    const event = await lastDamageEvent();
    expect(event?.summary).toContain("resistance");
    expect(event?.summary).toContain("6");
    const data = event?.data as Record<string, unknown>;
    expect(data).toMatchObject({ amount: 12, appliedAmount: 6, damageType: "slashing", resisted: true });
  });

  it("does not halve a non-matching damage type", async () => {
    await seed([{ damageType: "slashing", source: "Rage", sourceEntryId: "rage-1" }]);
    await damage({ amount: 12, damageType: "fire" });
    expect(await current()).toBe(18); // 30 - 12
    const data = (await lastDamageEvent())?.data as Record<string, unknown>;
    expect(data).toMatchObject({ appliedAmount: 12, resisted: false });
  });

  it("keeps typeless damage working with no regression (full amount)", async () => {
    await seed([{ damageType: "slashing", source: "Rage", sourceEntryId: "rage-1" }]);
    await damage({ amount: 12 });
    expect(await current()).toBe(18);
    const event = await lastDamageEvent();
    expect(event?.summary).not.toContain("resistance");
    const data = event?.data as Record<string, unknown>;
    expect(data).toMatchObject({ appliedAmount: 12, resisted: false, damageType: null });
  });

  it("honors a manual override declining the halve (resist=false)", async () => {
    await seed([{ damageType: "slashing", source: "Rage", sourceEntryId: "rage-1" }]);
    await damage({ amount: 12, damageType: "slashing", resist: false });
    expect(await current()).toBe(18); // full 12 applied despite the match
  });

  it("applies full damage when no resistances are active", async () => {
    await seed([]);
    await damage({ amount: 12, damageType: "slashing" });
    expect(await current()).toBe(18);
  });
});
