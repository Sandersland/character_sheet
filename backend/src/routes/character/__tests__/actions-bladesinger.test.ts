// TCoE p. 76 (#1676)
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { applyInventoryOperations } from "@/lib/inventory/inventory.js";
import { inventoryItemFixtureData } from "@/test-support/inventory-snapshot-fixture.js";
import { seededSpeciesAnchor } from "@/test-support/species.js";

const OWNER_ID = "owner-actions-bladesinger";
let COOKIE: string;

let wizardClassId: string;
let bladesingerId: string;

const XP_L2 = 300;
const XP_L6 = 14000;
const XP_L10 = 64000;
const XP_L14 = 140000;

const ABILITY_SCORES_INT_FLOOR = {
  strength: 10, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 12, charisma: 10,
};
const ABILITY_SCORES_INT_BONUS = {
  strength: 10, dexterity: 12, constitution: 14, intelligence: 18, wisdom: 12, charisma: 10,
};

interface Buff {
  key: string;
  target: string;
  modifier: number;
}
interface Pool {
  key: string;
  used: number;
  remaining: number;
  total: number;
}
interface AttackRow {
  kind: string;
  damageComponents?: { meleeDamageBonus: number };
}
interface SkillEntry {
  name: string;
  proficient: boolean;
}
interface ArmorProf {
  category: string;
}
interface CharBody {
  armorClass: number;
  speed: number;
  attacksPerAction?: number;
  activeEffects: { buffs: Buff[] };
  resources: { pools: Pool[] };
  attackRows: AttackRow[];
  skills: SkillEntry[];
  armorProficiencies: ArmorProf[];
  classes: { subclass?: string }[];
  error?: string;
}

function agent() {
  return supertest.agent(app).set("Cookie", COOKIE);
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
  const wizard = await prisma.characterClass.findUnique({ where: { name: "Wizard" }, select: { id: true } });
  if (!wizard) throw new Error("Wizard class not seeded — run `prisma db seed` before tests");
  wizardClassId = wizard.id;
  const sub = await prisma.subclass.findFirst({
    where: { classId: wizardClassId, slug: "wizard-bladesinging" },
    select: { id: true },
  });
  if (!sub) throw new Error("Bladesinging subclass not seeded — run `prisma db seed` before tests");
  bladesingerId = sub.id;
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "Bladesinger Test" } } });
});

async function createWizard(
  name: string,
  rulesEdition: "EDITION_2014" | "EDITION_2024",
  xp: number,
  abilityScores: typeof ABILITY_SCORES_INT_FLOOR = ABILITY_SCORES_INT_FLOOR,
): Promise<string> {
  const anchor = await seededSpeciesAnchor(rulesEdition);
  const res = await agent().post("/api/characters").send({
    name,
    alignment: "True Neutral",
    ...anchor,
    background: "Sage",
    classes: [{ name: "Wizard" }],
    abilityScores,
    rulesEdition,
    experiencePoints: xp,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

function setSubclass(characterId: string, subclassId: string) {
  return agent()
    .post(`/api/characters/${characterId}/class/transactions`)
    .send({ operations: [{ type: "setSubclass", subclassId }] });
}

async function createBladesinger(
  name: string,
  xp: number,
  abilityScores: typeof ABILITY_SCORES_INT_FLOOR = ABILITY_SCORES_INT_FLOOR,
): Promise<string> {
  const id = await createWizard(name, "EDITION_2014", xp, abilityScores);
  const res = await setSubclass(id, bladesingerId);
  expect(res.status).toBe(200);
  return id;
}

function executeAction(characterId: string, actionKey: string, extra?: Record<string, unknown>) {
  return agent()
    .post(`/api/characters/${characterId}/actions/transactions`)
    .send({ operations: [{ type: "executeAction", actionKey, ...extra }] });
}

function get(characterId: string) {
  return agent().get(`/api/characters/${characterId}`);
}

function pool(body: CharBody, key: string): Pool | undefined {
  return body.resources.pools.find((p) => p.key === key);
}

function buff(body: CharBody, key: string): Buff | undefined {
  return body.activeEffects.buffs.find((b) => b.key === key);
}

function buffKeys(body: CharBody): string[] {
  return body.activeEffects.buffs.map((b) => b.key);
}

// deriveAttacksPerAction reads classEntries[0]'s raw `level` column, never effectiveEntryLevel — sync it here for fixtures that exercise it.
async function syncEntryLevel(characterId: string, level: number): Promise<void> {
  await prisma.characterClassEntry.updateMany({ where: { characterId }, data: { level } });
}

describe("crossEditionRejection — wizard-bladesinging is EDITION_2014-only (#1676)", () => {
  it("(AC) a 2024 wizard picking Bladesinging 400s naming both editions", async () => {
    const id = await createWizard("Bladesinger Test XEd 2024", "EDITION_2024", XP_L2);
    const res = await setSubclass(id, bladesingerId);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/2014 rules/);
    expect(res.body.error).toMatch(/2024 rules/);
  });

  it("(unchanged) a 2014 wizard picking Bladesinging succeeds", async () => {
    const id = await createWizard("Bladesinger Test XEd 2014", "EDITION_2014", XP_L2);
    const res = await setSubclass(id, bladesingerId);
    expect(res.status).toBe(200);
    expect(res.body.classes[0].subclass).toBe("Bladesinging");
  });
});

describe("Bladesong toggle (#1686) — L2 activation applies AC/speed buffs and spends the PB pool", () => {
  it("floors AC to +1 when Intelligence modifier is 0", async () => {
    const id = await createBladesinger("Bladesinger Test L2 Floor", XP_L2, ABILITY_SCORES_INT_FLOOR);
    const before = await get(id);
    expect(before.status).toBe(200);
    const baselineAc = (before.body as CharBody).armorClass;
    const baselineSpeed = (before.body as CharBody).speed;

    const res = await executeAction(id, "bladesong");
    expect(res.status).toBe(200);
    const body = res.body as CharBody;

    expect(buff(body, "bladesong")).toMatchObject({ target: "ac", modifier: 1 });
    expect(buff(body, "bladesongSpeed")).toMatchObject({ target: "speed", modifier: 10 });
    expect(body.armorClass).toBe(baselineAc + 1);
    expect(body.speed).toBe(baselineSpeed + 10);

    expect(pool(body, "bladesong")).toMatchObject({ total: 2, used: 1, remaining: 1 });
  });

  it("carries the real Intelligence modifier once it exceeds the floor", async () => {
    const id = await createBladesinger("Bladesinger Test L2 Bonus", XP_L2, ABILITY_SCORES_INT_BONUS);
    const res = await executeAction(id, "bladesong");
    expect(res.status).toBe(200);
    expect(buff(res.body as CharBody, "bladesong")).toMatchObject({ modifier: 4 });
  });

  it("no Song of Victory (meleeDamage) buff below level 14", async () => {
    const id = await createBladesinger("Bladesinger Test L2 NoVictory", XP_L2);
    const res = await executeAction(id, "bladesong");
    expect(res.status).toBe(200);
    expect(buff(res.body as CharBody, "bladesongMeleeDamage")).toBeUndefined();
  });

  it("endBladesong clears all three buffs; AC/speed revert; the pool use is NOT refunded", async () => {
    const id = await createBladesinger("Bladesinger Test L2 End", XP_L2);
    const before = await get(id);
    const baselineAc = (before.body as CharBody).armorClass;
    const baselineSpeed = (before.body as CharBody).speed;

    await executeAction(id, "bladesong");
    const ended = await executeAction(id, "endBladesong");
    expect(ended.status).toBe(200);
    const body = ended.body as CharBody;

    expect(buffKeys(body)).toEqual([]);
    expect(body.armorClass).toBe(baselineAc);
    expect(body.speed).toBe(baselineSpeed);
    expect(pool(body, "bladesong")).toMatchObject({ used: 1, remaining: 1 });
  });

  it("cannot activate while wearing medium armor (#1688's armor gate)", async () => {
    const id = await createBladesinger("Bladesinger Test Gate Medium", XP_L2);
    const armor = await prisma.inventoryItem.create({
      data: inventoryItemFixtureData({
        characterId: id,
        name: "Test Chain Shirt",
        category: "armor",
        armor: { armorCategory: "medium", baseArmorClass: 13, dexModifierApplies: true },
      }),
    });
    await applyInventoryOperations(id, [{ type: "equip", inventoryItemId: armor.id, slot: "BODY" }]);

    const res = await executeAction(id, "bladesong");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot be activated while wearing medium armor/);
  });

  it("equipping medium armor while Bladesong is active clears it; light armor does not", async () => {
    const id = await createBladesinger("Bladesinger Test Equip Clear", XP_L2);
    await executeAction(id, "bladesong");

    const light = await prisma.inventoryItem.create({
      data: inventoryItemFixtureData({
        characterId: id,
        name: "Test Leather Armor",
        category: "armor",
        armor: { armorCategory: "light", baseArmorClass: 11, dexModifierApplies: true },
      }),
    });
    await applyInventoryOperations(id, [{ type: "equip", inventoryItemId: light.id, slot: "BODY" }]);
    const afterLight = await get(id);
    expect(buffKeys(afterLight.body as CharBody)).toEqual(expect.arrayContaining(["bladesong", "bladesongSpeed"]));

    const medium = await prisma.inventoryItem.create({
      data: inventoryItemFixtureData({
        characterId: id,
        name: "Test Chain Shirt",
        category: "armor",
        armor: { armorCategory: "medium", baseArmorClass: 13, dexModifierApplies: true },
      }),
    });
    // A body slot rejects a second occupant outright — unequip light armor before donning medium.
    await applyInventoryOperations(id, [{ type: "setEquipped", inventoryItemId: light.id, equipped: false }]);
    await applyInventoryOperations(id, [{ type: "equip", inventoryItemId: medium.id, slot: "BODY" }]);
    const afterMedium = await get(id);
    expect(buffKeys(afterMedium.body as CharBody)).toEqual([]);
  });

  it("the activation batch logs exactly a spendResource + buffApplied pair (AC/speed) at L2 — Song of Victory's entry is level-gated out", async () => {
    const id = await createBladesinger("Bladesinger Test Batch", XP_L2);
    await executeAction(id, "bladesong");
    const events = await agent().get(`/api/characters/${id}/activity`);
    const batchId = (events.body as { batchId?: string; type: string }[]).find(
      (e) => e.type !== "revert" && e.batchId,
    )?.batchId;
    expect(batchId).toBeDefined();
    const types = (events.body as { batchId?: string; type: string }[])
      .filter((e) => e.batchId === batchId)
      .map((e) => e.type)
      .sort();
    expect(types).toEqual(["buffApplied", "buffApplied", "spendResource"]);
  });
});

describe("Training in War and Song (#1691) — L2 fixed grants, active regardless of Bladesong", () => {
  it("serializes light armor proficiency and Performance skill proficiency", async () => {
    const id = await createBladesinger("Bladesinger Test Profs", XP_L2);
    const res = await get(id);
    expect(res.status).toBe(200);
    const body = res.body as CharBody;
    expect(body.armorProficiencies.map((p) => p.category)).toContain("light");
    const performance = body.skills.find((s) => s.name === "performance");
    expect(performance?.proficient).toBe(true);
  });
});

describe("Extra Attack (#1676) — L6", () => {
  it("attacksPerAction === 2", async () => {
    const id = await createBladesinger("Bladesinger Test L6", XP_L6);
    await syncEntryLevel(id, 6);
    const res = await get(id);
    expect(res.status).toBe(200);
    expect((res.body as CharBody).attacksPerAction).toBe(2);
  });
});

describe("Song of Victory (#1676) — L14, rides Bladesong's toggle", () => {
  async function equipWeapon(characterId: string) {
    const weapon = await prisma.inventoryItem.create({
      data: inventoryItemFixtureData({
        characterId,
        name: "Test Rapier",
        category: "weapon",
        weapon: {
          damageDiceCount: 1, damageDiceFaces: 8, damageModifier: 0, damageType: "piercing",
          finesse: true, light: false, heavy: false, twoHanded: false, reach: false, thrown: false, ammunition: false,
          // deriveWeaponDamage applies meleeDamage buffs only when weaponRange === "melee".
          weaponRange: "melee",
        },
      }),
    });
    await applyInventoryOperations(characterId, [{ type: "equip", inventoryItemId: weapon.id, slot: "MAIN_HAND" }]);
  }

  it("active-Bladesong melee damage includes the Intelligence modifier", async () => {
    const id = await createBladesinger("Bladesinger Test L14", XP_L14, ABILITY_SCORES_INT_BONUS);
    await equipWeapon(id);
    const res = await executeAction(id, "bladesong");
    expect(res.status).toBe(200);
    const body = res.body as CharBody;
    expect(buff(body, "bladesongMeleeDamage")).toMatchObject({ target: "meleeDamage", modifier: 4 });
    const weaponRow = body.attackRows.find((r) => r.kind === "weapon");
    expect(weaponRow?.damageComponents?.meleeDamageBonus).toBe(4);
  });

  it("no melee-damage bonus once Bladesong ends", async () => {
    const id = await createBladesinger("Bladesinger Test L14 End", XP_L14, ABILITY_SCORES_INT_BONUS);
    await equipWeapon(id);
    await executeAction(id, "bladesong");
    const ended = await executeAction(id, "endBladesong");
    expect(ended.status).toBe(200);
    const weaponRow = (ended.body as CharBody).attackRows.find((r) => r.kind === "weapon");
    expect(weaponRow?.damageComponents?.meleeDamageBonus).toBe(0);
  });
});

describe("Song of Defense (#1687's deferred slot-picker, #1676) — L10, gated on Bladesong (#1688)", () => {
  it("400s while Bladesong is inactive", async () => {
    const id = await createBladesinger("Bladesinger Test SoD Gate", XP_L10);
    const res = await executeAction(id, "songOfDefense", { slotLevel: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/requires bladesong to be active/);
  });

  it("succeeds while Bladesong is active, expending exactly the chosen slot level", async () => {
    const id = await createBladesinger("Bladesinger Test SoD Active", XP_L10);
    await executeAction(id, "bladesong");
    const res = await executeAction(id, "songOfDefense", { slotLevel: 2 });
    expect(res.status).toBe(200);
    const body = res.body as { spellcasting: { slots: { level: number; total: number; used: number }[] } };
    const l2 = body.spellcasting.slots.find((s) => s.level === 2)!;
    expect(l2.used).toBe(1);
  });

  it("logs an undoable spellcasting-category spend event", async () => {
    const id = await createBladesinger("Bladesinger Test SoD Log", XP_L10);
    await executeAction(id, "bladesong");
    await executeAction(id, "songOfDefense", { slotLevel: 1 });
    const events = await agent().get(`/api/characters/${id}/activity`);
    const spend = (events.body as { type: string; category: string }[]).find((e) => e.type === "castAbilitySlot");
    expect(spend).toBeDefined();
    expect(spend!.category).toBe("spellcasting");
  });
});
