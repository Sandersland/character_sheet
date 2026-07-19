import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { migrateFightingStylesToFeats } from "../migrate-fighting-styles-feats-2024.js";

const OWNER_ID = "owner-migrate-fs";
const L5_XP = 6500;
const app = createApp();
let COOKIE: string;

const BASE = {
  alignment: "Neutral", initiativeBonus: 3, speed: 30,
  hitPoints: { current: 44, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 5, die: "d10", spent: 0 },
  abilityScores: { strength: 16, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [], skills: [], toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

async function seedFighter(id: string, styleKey: string | null, inventory: Prisma.InventoryItemCreateWithoutCharacterInput[] = []) {
  const resources: Record<string, unknown> = {
    used: {}, maneuversKnown: [], disciplinesKnown: [], toolProficienciesKnown: [], choicesKnown: {}, advancements: [],
  };
  if (styleKey) resources.fightingStyle = styleKey;
  return prisma.character.create({
    data: {
      ...BASE, id, name: `MigFS ${id}`, ownerId: OWNER_ID, experiencePoints: L5_XP,
      spellcasting: Prisma.JsonNull,
      resources: resources as unknown as Prisma.InputJsonValue,
      classEntries: { create: [{ position: 0, name: "Fighter", level: 5 }] },
      ...(inventory.length ? { inventoryItems: { create: inventory } } : {}),
    },
  });
}

async function get(id: string) {
  return supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${id}`);
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "MigFS" } } });
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "MigFS" } } });
});

const armor = (name: string, category: "light" | "medium" | "heavy", baseArmorClass: number, dexModifierMax?: number): Prisma.InventoryItemCreateWithoutCharacterInput => ({
  name, category: "armor", equippedSlot: "BODY",
  armorDetail: { create: { armorCategory: category, baseArmorClass, ...(dexModifierMax != null ? { dexModifierMax } : {}) } },
});
const longbow: Prisma.InventoryItemCreateWithoutCharacterInput = {
  name: "Longbow", category: "weapon", equippedSlot: "MAIN_HAND",
  weaponDetail: { create: { damageDiceCount: 1, damageDiceFaces: 8, damageType: "piercing", weaponRange: "ranged", twoHanded: true } },
};

describe("migrateFightingStylesToFeats (#1137)", () => {
  it("converts Defense to a feat and preserves the +1 AC while armored (identity)", async () => {
    await seedFighter("mig-fs-def", "defense", [armor("Chain Mail", "heavy", 16)]);
    // Pre-migration: the scalar is inert under the new code (AC = 16).
    const before = await get("mig-fs-def");
    expect(before.body.armorClass).toBe(16);

    const result = await migrateFightingStylesToFeats(prisma);
    expect(result.changedCharacters).toContain("mig-fs-def");

    // Post-migration: the Defense feat restores the +1 while armored (AC = 17) —
    // the value the character had under the pre-2024 scalar system.
    const after = await get("mig-fs-def");
    expect(after.body.armorClass).toBe(17);
    const fs = after.body.advancements.find((a: { slot?: string }) => a.slot === "fightingStyle");
    expect(fs).toMatchObject({ featName: "Defense", slot: "fightingStyle" });
    expect(fs.featId).toBeTruthy(); // catalog feat
    expect(after.body.fightingStyleSlots).toMatchObject({ total: 1, used: 1 });
  });

  it("converts Archery to a feat and preserves the +2 ranged attack (identity)", async () => {
    await seedFighter("mig-fs-arch", "archery", [longbow]);
    const before = await get("mig-fs-arch");
    const baseAttack = before.body.inventory.find((i: { name: string }) => i.name === "Longbow").weapon.attackBonus;

    await migrateFightingStylesToFeats(prisma);

    const after = await get("mig-fs-arch");
    const attack = after.body.inventory.find((i: { name: string }) => i.name === "Longbow").weapon.attackBonus;
    expect(attack).toBe(baseAttack + 2); // +2 Archery restored by the migrated feat
  });

  it("converts Dueling (non-SRD) to a custom feat entry with no featId", async () => {
    await seedFighter("mig-fs-duel", "dueling");
    const result = await migrateFightingStylesToFeats(prisma);
    expect(result.changedCharacters).toContain("mig-fs-duel");
    const after = await get("mig-fs-duel");
    const fs = after.body.advancements.find((a: { slot?: string }) => a.slot === "fightingStyle");
    expect(fs.featName).toBe("Dueling");
    expect(fs.featId).toBeUndefined();
  });

  it("clears the scalar from stored resources and leaves a no-style character untouched", async () => {
    await seedFighter("mig-fs-def2", "defense");
    await seedFighter("mig-fs-none", null);
    const result = await migrateFightingStylesToFeats(prisma);
    expect(result.changedCharacters).toContain("mig-fs-def2");
    expect(result.changedCharacters).not.toContain("mig-fs-none");

    const row = await prisma.character.findUniqueOrThrow({ where: { id: "mig-fs-def2" } });
    expect((row.resources as Record<string, unknown>).fightingStyle).toBeUndefined();
  });

  it("writes one undoable advancement featTaken event per changed character", async () => {
    await seedFighter("mig-fs-ev", "defense");
    await migrateFightingStylesToFeats(prisma);
    const events = await prisma.characterEvent.findMany({ where: { characterId: "mig-fs-ev", type: "featTaken" } });
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe("advancement");
    expect((events[0].data as { migration?: string }).migration).toBe("fighting-style-feats-2024");
  });

  it("is idempotent — a second run changes nothing", async () => {
    await seedFighter("mig-fs-idem", "defense");
    await migrateFightingStylesToFeats(prisma);
    const second = await migrateFightingStylesToFeats(prisma);
    expect(second.changedCharacters).not.toContain("mig-fs-idem");
    const after = await get("mig-fs-idem");
    expect(after.body.advancements.filter((a: { slot?: string }) => a.slot === "fightingStyle")).toHaveLength(1);
  });
});
